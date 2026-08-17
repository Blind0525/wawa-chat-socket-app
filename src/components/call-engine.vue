<template>
	<view>
		<!-- renderjs 信令桥(组件级:官方标准姿势,callMethod 可靠) -->
		<view class="ce-bridge" :signal="signal" :change:signal="onSignalChange"></view>
		<!-- 远端画面(视频通话时显示;语音通话隐藏但音频照播) -->
		<view id="remote-video" class="ce-remote" :class="{ show: isVideo }"></view>
		<!-- 本地预览 -->
		<view id="local-video" class="ce-local" :class="{ show: isVideo }"></view>
	</view>
</template>

<script>
/**
 * WebRTC 通话引擎组件
 * 逻辑层薄壳:转发 renderjs 回传事件给页面;透传 signal/callType
 */
export default {
	name: 'CallEngine',
	props: {
		signal: { type: Object, default: null },
		callType: { type: String, default: 'video' }
	},
	data() {
		return {
			isVideo: true
		}
	},
	watch: {
		callType(v) {
			this.isVideo = v === 'video'
		}
	},
	methods: {
		/** 占位:消除模板 change:signal 的 Vue warn(实际 handler 在 renderjs) */
		onSignalChange() {},
		/** renderjs -> 页面:WebRTC 信令(offer/answer/candidate) */
		onSignalOut(payload) {
			this.$emit('signal-out', payload)
		},
		/** renderjs -> 页面:通话异常结束 */
		onCallEnded(info) {
			this.$emit('call-ended', info)
		},
		/** renderjs -> 页面:引擎就绪 */
		onRenderReady() {
			this.$emit('render-ready')
		},
		/** renderjs -> 页面:引擎错误 */
		onRenderError(info) {
			this.$emit('render-error', info)
		}
	}
}
</script>

<script module="webrtc" lang="renderjs">
/**
 * renderjs:WebRTC 视图层实现(组件级)
 * - 操作 DOM / getUserMedia / RTCPeerConnection
 * - 逻辑层指令:watch signal + change:prop 双通道(带防重)
 * - 回传:this.$ownerInstance.callMethod('onSignalOut'/'onCallEnded'/...)
 */
const RTC_CONFIG = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] }

export default {
	data() {
		return {
			pc: null,
			localStream: null,
			recoverTimer: null,
			lastSignalKey: ''
		}
	},
	mounted() {
		try {
			this.callMethod('onRenderReady')
		} catch (e) {
			this.callMethod('onRenderError', { message: String(e && e.message || e) })
		}
	},
	watch: {
		signal(val) {
			if (val) this.handleSignal(val)
		}
	},
	methods: {
		/** change:prop 桥(与 watch 双通道,防重) */
		onSignalChange(newVal, oldVal, ownerInstance, instance) {
			if (newVal) this.handleSignal(newVal)
		},
		handleSignal(s) {
			const key = JSON.stringify(s)
			if (this.lastSignalKey === key) return
			this.lastSignalKey = key
			switch (s.action) {
				case 'start':
					this.startCall(s.callType || 'video')
					break
				case 'accept':
					this.acceptCall(s.callType || this.callType, s.offer)
					break
				case 'setRemote':
					this.setRemoteDescription(s.sdp)
					break
				case 'candidate':
					this.addIceCandidate(s.candidate)
					break
				case 'switchCamera':
					this.switchCamera()
					break
				case 'toggleCamera':
					this.toggleCamera(s.on)
					break
				case 'hangup':
					this.hangup()
					break
			}
		},
		// ===== 主叫发起 =====
		async startCall(type) {
			try {
				this.createPeer()
				const stream = await this.getMedia(type)
				this.localStream = stream
				stream.getTracks().forEach(t => this.pc.addTrack(t, stream))
				if (type === 'video') this.showLocalPreview(stream)

				const offer = await this.pc.createOffer()
				await this.pc.setLocalDescription(offer)
				this.callMethod('onSignalOut', {
					action: 'invite',
					callType: type,
					sdp: offer
				})
			} catch (e) {
				console.error('发起通话失败', e)
				this.callMethod('onCallEnded', { reason: 'error', message: String(e && e.message || e) })
			}
		},
		// ===== 被叫接听 =====
		async acceptCall(type, offerSdp) {
			try {
				this.createPeer()
				const stream = await this.getMedia(type)
				this.localStream = stream
				stream.getTracks().forEach(t => this.pc.addTrack(t, stream))
				if (type === 'video') this.showLocalPreview(stream)

				if (offerSdp) {
					await this.pc.setRemoteDescription(new RTCSessionDescription(offerSdp))
				}
				const answer = await this.pc.createAnswer()
				await this.pc.setLocalDescription(answer)
				this.callMethod('onSignalOut', { action: 'accept', sdp: answer })
			} catch (e) {
				console.error('接听失败', e)
				this.callMethod('onCallEnded', { reason: 'error', message: String(e && e.message || e) })
			}
		},
		async setRemoteDescription(sdp) {
			try {
				if (this.pc && sdp) {
					await this.pc.setRemoteDescription(new RTCSessionDescription(sdp))
				}
			} catch (e) {
				console.error('setRemoteDescription 失败', e)
			}
		},
		async addIceCandidate(candidate) {
			try {
				if (this.pc && candidate) {
					await this.pc.addIceCandidate(new RTCIceCandidate(candidate))
				}
			} catch (e) {
				console.error('addIceCandidate 失败', e)
			}
		},
		// ===== 媒体 =====
		async getMedia(type) {
			const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
			if (type === 'video') {
				const vs = await navigator.mediaDevices.getUserMedia({ video: true })
				vs.getVideoTracks().forEach(t => stream.addTrack(t))
			}
			return stream
		},
		createPeer() {
			this.hangup()
			this.pc = new RTCPeerConnection(RTC_CONFIG)

			this.pc.onicecandidate = (e) => {
				if (e.candidate) {
					this.callMethod('onSignalOut', {
						action: 'candidate',
						candidate: e.candidate.toJSON ? e.candidate.toJSON() : e.candidate
					})
				}
			}

			this.pc.ontrack = (e) => {
				const remoteStream = e.streams[0]
				if (!remoteStream) return
				const container = document.getElementById('remote-video')
				if (!container) return
				container.innerHTML = ''
				const v = document.createElement('video')
				v.autoplay = true
				v.playsInline = true
				v.muted = false
				v.setAttribute('playsinline', '')
				v.setAttribute('webkit-playsinline', '')
				v.style.width = '100%'
				v.style.height = '100%'
				v.style.objectFit = 'cover'
				v.style.pointerEvents = 'none'
				try {
					if ('srcObject' in v) {
						v.srcObject = remoteStream
					} else {
						v.src = URL.createObjectURL(remoteStream)
					}
				} catch (err) {
					v.src = URL.createObjectURL(remoteStream)
				}
				container.appendChild(v)
				const tryPlay = () => {
					const p = v.play()
					if (p && p.catch) {
						p.catch(() => {
							container.classList.add('need-gesture')
						})
					} else {
						container.classList.remove('need-gesture')
					}
				}
				v.onloadedmetadata = tryPlay
				setTimeout(tryPlay, 100)
				setTimeout(tryPlay, 500)
				container.addEventListener('click', () => {
					tryPlay()
					container.classList.remove('need-gesture')
				})
				container.addEventListener('touchend', () => {
					tryPlay()
					container.classList.remove('need-gesture')
				})
			}

			this.pc.onconnectionstatechange = () => {
				if (!this.pc) return
				const st = this.pc.connectionState
				if (st === 'failed') {
					this.callMethod('onCallEnded', { reason: 'failed' })
				} else if (st === 'disconnected') {
					if (!this.recoverTimer) {
						this.recoverTimer = setTimeout(() => {
							if (this.pc && this.pc.connectionState === 'disconnected') {
								this.callMethod('onCallEnded', { reason: 'disconnected' })
							}
							this.recoverTimer = null
						}, 8000)
					}
				} else if (st === 'connected') {
					if (this.recoverTimer) { clearTimeout(this.recoverTimer); this.recoverTimer = null }
				}
			}
			return this.pc
		},
		showLocalPreview(stream) {
			const container = document.getElementById('local-video')
			if (!container) return
			container.innerHTML = ''
			const v = document.createElement('video')
			v.autoplay = true
			v.playsInline = true
			v.muted = true
			v.setAttribute('muted', '')
			v.setAttribute('playsinline', '')
			v.setAttribute('webkit-playsinline', '')
			v.style.width = '100%'
			v.style.height = '100%'
			v.style.objectFit = 'cover'
			v.style.pointerEvents = 'none'
			try {
				if ('srcObject' in v) {
					v.srcObject = stream
				} else {
					v.src = URL.createObjectURL(stream)
				}
			} catch (e) {
				v.src = URL.createObjectURL(stream)
			}
			container.appendChild(v)
			const doPlay = () => { v.play().catch(() => { /* ignore */ }) }
			v.onloadedmetadata = doPlay
			setTimeout(doPlay, 100)
		},
		async switchCamera() {
			if (!this.localStream) return
			try {
				const devices = await navigator.mediaDevices.enumerateDevices()
				const cams = devices.filter(d => d.kind === 'videoinput')
				if (cams.length < 2) return
				const curTrack = this.localStream.getVideoTracks()[0]
				const curDeviceId = (curTrack && curTrack.getSettings && curTrack.getSettings().deviceId) || ''
				const next = cams.find(c => c.deviceId && c.deviceId !== curDeviceId) || cams[0]
				let vs = null
				try {
					vs = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: next.deviceId } } })
				} catch (e1) {
					vs = await navigator.mediaDevices.getUserMedia({ video: true })
				}
				const newTrack = vs.getVideoTracks()[0]
				if (!newTrack) return
				const oldTracks = this.localStream.getVideoTracks()
				oldTracks.forEach(t => {
					this.localStream.removeTrack(t)
					t.stop()
				})
				this.localStream.addTrack(newTrack)
				if (this.pc) {
					const sender = this.pc.getSenders().find(s => s.track && s.track.kind === 'video')
					if (sender) await sender.replaceTrack(newTrack)
				}
				this.showLocalPreview(this.localStream)
			} catch (e) {
				console.error('切换摄像头失败', e)
			}
		},
		toggleCamera(on) {
			if (!this.localStream) return
			const tracks = this.localStream.getVideoTracks()
			tracks.forEach(t => { t.enabled = !!on })
		},
		hangup() {
			if (this.recoverTimer) { clearTimeout(this.recoverTimer); this.recoverTimer = null }
			if (this.localStream) {
				try { this.localStream.getTracks().forEach(t => t.stop()) } catch (e) { /* ignore */ }
				this.localStream = null
			}
			if (this.pc) {
				try {
					this.pc.ontrack = null
					this.pc.onicecandidate = null
					this.pc.close()
				} catch (e) { /* ignore */ }
				this.pc = null
			}
			;['remote-video', 'local-video'].forEach(id => {
				const el = document.getElementById(id)
				if (el) el.innerHTML = ''
			})
		},
		callMethod(name, payload) {
			if (this.$ownerInstance && this.$ownerInstance.callMethod) {
				this.$ownerInstance.callMethod(name, payload)
			}
		}
	}
}
</script>

<style scoped>
.ce-bridge {
	position: fixed; left: -9999px; top: -9999px;
	width: 1px; height: 1px;
	opacity: 0;
}
/* 远端画面:默认隐藏,视频通话时显示(语音通话隐藏但音频照播) */
.ce-remote {
	position: fixed; inset: 0;
	background: #000;
	display: none;
	overflow: hidden;
}
.ce-remote.show { display: block; }
.ce-remote.need-gesture::after {
	content: '点击画面启用声音';
	position: absolute; left: 0; right: 0; bottom: 30%;
	text-align: center;
	color: #fff;
	font-size: 14px;
	background: rgba(0,0,0,0.4);
	padding: 8px 0;
}
/* 本地小窗:默认隐藏,视频通话时显示 */
.ce-local {
	position: fixed; top: 16px; right: 16px;
	width: 110px; height: 150px;
	border-radius: 10px; overflow: hidden;
	background: #000;
	border: 1px solid rgba(255,255,255,0.3);
	display: none;
	z-index: 2;
}
.ce-local.show { display: block; }
</style>
