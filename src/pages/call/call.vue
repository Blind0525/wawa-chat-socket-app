<template>
	<view class="call-page">

		<!-- renderjs 信令桥(不可见;change:prop 是 uni-app renderjs 官方推荐通信方式,比 watch data 可靠) -->
		<view class="signal-bridge" :signal="signal" :change:signal="onSignalChange"></view>

		<!-- 渲染层异常提示(诊断用) -->
		<view v-if="renderError" class="render-error">{{ renderError }}</view>

		<!-- 来电 -->
		<view v-if="callState === 'ringing'" class="call-ui">
			<view class="call-avatar">{{ callType === 'video' ? '📹' : '📞' }}</view>
			<view class="call-title">顾客来电</view>
			<view class="call-subtitle">{{ callType === 'video' ? '视频通话' : '语音通话' }}</view>
			<view class="call-btns">
				<view class="call-btn decline" @click="rejectCall">拒 绝</view>
				<view class="call-btn accept" @click="acceptCall">接 听</view>
			</view>
		</view>

		<!-- 呼叫中 -->
		<view v-else-if="callState === 'calling'" class="call-ui">
			<view class="call-avatar">{{ callType === 'video' ? '📹' : '📞' }}</view>
			<view class="call-title">正在呼叫...</view>
			<view class="call-subtitle">{{ callType === 'video' ? '视频通话' : '语音通话' }}</view>
			<view class="call-btns">
				<view class="call-btn hangup" @click="hangUpCall">取 消</view>
			</view>
		</view>

		<!-- 通话中 -->
		<view v-else-if="callState === 'incall'" class="call-ui">
			<!-- 视频:大画面 + 本地小窗(renderjs 渲染) -->
			<view v-if="callType === 'video'" class="call-videos">
				<view id="remote-video" class="call-remote"></view>
				<view id="local-video" class="call-local"></view>
			</view>
			<!-- 语音:名字 + 计时(隐藏容器承载对端音频) -->
			<view v-else class="call-ui-center">
				<view id="remote-video" class="call-remote-hidden"></view>
				<view class="call-avatar">📞</view>
				<view class="call-title">{{ customerName || '顾客' }}</view>
				<view class="call-subtitle">{{ callTimer }}</view>
			</view>
			<view v-if="callType === 'video'" class="call-timer">{{ callTimer }}</view>
			<view class="call-btns">
				<view v-if="callType === 'video'" class="call-btn ctrl" @click="switchCamera">翻转</view>
				<view v-if="callType === 'video'" class="call-btn ctrl" @click="toggleCamera">{{ cameraOn ? '关摄像头' : '开摄像头' }}</view>
				<view class="call-btn hangup" @click="hangUpCall">挂 断</view>
			</view>
		</view>

		<!-- 通话结束 -->
		<view v-else-if="callState === 'ended'" class="call-ui">
			<view class="call-avatar">{{ callType === 'video' ? '📹' : '📞' }}</view>
			<view class="call-title">{{ endText }}</view>
			<view v-if="callTimer !== '00:00'" class="call-subtitle">通话时长 {{ callTimer }}</view>
			<view class="call-btns">
				<view class="call-btn hangup" @click="closePage">关 闭</view>
			</view>
		</view>

	</view>
</template>

<script>
import { ChatSocket } from '@/utils/ws'

/**
 * 原生通话页(uni-app renderjs 实现 WebRTC,无 web-view)
 * 职责划分:
 *   逻辑层:ws 信令收发、UI 状态(calling/ringing/incall/ended)、计时器、按钮事件
 *   renderjs:WebRTC 全流程(getUserMedia / RTCPeerConnection / offer / answer /
 *            candidate / 本地远端视频渲染),通过 signal 下发指令、callMethod 回传信令
 * URL 参数:sessionId peerId token name type(video|audio) mode(outgoing|incoming) auto(1=自动接听)
 */
export default {
	data() {
		return {
			callState: 'idle',      // idle | calling | ringing | incall | ended
			callType: 'video',
			callTimer: '00:00',
			endText: '通话已结束',
			cameraOn: true,
			wsConnected: false,
			sessionId: null,
			peerUserId: null,
			token: '',
			customerName: '',
			mode: 'outgoing',
			autoAccept: false,
			// 下发给 renderjs 的信令(对象整体替换触发 renderjs watch)
			signal: null,
			pendingOffer: null,
			callSeconds: 0,
			timerInterval: null,
			// 诊断:renderjs 是否就绪(2秒内未就绪提示通话引擎异常)
			renderReady: false,
			renderError: ''
		}
	},
	onLoad(options) {
		this.sessionId = Number(options.sessionId) || null
		this.peerUserId = options.peerId || null
		this.token = options.token || ''
		this.customerName = options.name || ''
		this.callType = options.type || 'video'
		this.mode = options.mode || 'outgoing'
		this.autoAccept = options.auto === '1'

		if (!this.peerUserId || !this.token) {
			this.endText = '参数缺失,无法通话'
			this.callState = 'ended'
			return
		}
		this.connectWs()
		// renderjs 健康检查:3 秒内没收到就绪回调则提示
		this.readyTimer = setTimeout(() => {
			if (!this.renderReady) {
				this.renderError = '通话引擎未就绪,请重新进入通话'
			}
		}, 3000)
	},
	/** renderjs -> 逻辑层:渲染层就绪回调 */
	onRenderReady() {
		this.renderReady = true
		this.renderError = ''
		if (this.readyTimer) { clearTimeout(this.readyTimer); this.readyTimer = null }
	},
	/** renderjs -> 逻辑层:渲染层异常上报 */
	onRenderError(info) {
		this.renderError = '通话引擎异常: ' + ((info && info.message) || '未知错误')
	},
	/** 占位:模板 change:signal 绑定指向 renderjs 同名方法,这里仅消除 Vue warn */
	onSignalChange() {},
	onUnload() {
		this.stopCallTimer()
		this.sendToRender({ action: 'hangup' })
		if (this.ws) { this.ws.close(); this.ws = null }
	},
	methods: {
		// ===== WebSocket 信令 =====
		connectWs() {
			this.ws = new ChatSocket({
				token: this.token,
				onConnected: () => {
					this.wsConnected = true
					// 主叫:连接后通知 renderjs 发起通话
					if (this.mode === 'outgoing') {
						this.sendToRender({ action: 'start', callType: this.callType })
						this.callState = 'calling'
						this.startCallTimer()
					}
				},
				onCall: (payload) => this.handleCallSignal(payload),
				onMsg: () => {},
				onAck: () => {},
				onError: (msg) => console.log('信令连接错误:', msg),
				onClose: () => { this.wsConnected = false }
			})
			this.ws.connect()
		},
		handleCallSignal(payload) {
			if (!payload || payload.type !== 'call') return
			switch (payload.action) {
				case 'invite':
					// 来电(实时或后端补发)
					this.callType = payload.callType || this.callType
					this.pendingOffer = payload
					if (this.autoAccept) {
						this.acceptCall()
					} else {
						this.callState = 'ringing'
					}
					break
				case 'accept':
					// 主叫:对方接听,设置远端 answer
					if (this.callState === 'calling' && payload.sdp) {
						this.sendToRender({ action: 'setRemote', sdp: payload.sdp })
						this.callState = 'incall'
						this.startCallTimer()
					}
					break
				case 'reject':
					if (this.callState === 'calling') {
						this.endText = '对方拒绝了通话'
						this.endCallLocal()
					}
					break
				case 'candidate':
					if (payload.candidate) {
						this.sendToRender({ action: 'candidate', candidate: payload.candidate })
					}
					break
				case 'hangup':
					if (this.callState !== 'idle' && this.callState !== 'ended') {
						this.endText = '对方已挂断'
						this.endCallLocal()
					}
					break
			}
		},
		/** 逻辑层 -> renderjs */
		sendToRender(action) {
			this.signal = Object.assign({}, action)
		},
		/** renderjs -> 逻辑层:WebRTC 产生的信令,经 ws 发出 */
		onSignalOut(payload) {
			if (!this.ws) return
			const msg = Object.assign({
				type: 'call',
				to: this.peerUserId,
				sessionId: this.sessionId
			}, payload)
			this.ws.send(msg)
		},
		/** renderjs -> 逻辑层:WebRTC 状态异常(ice failed / disconnected 超时) */
		onCallEnded(info) {
			if (this.callState === 'ended' || this.callState === 'idle') return
			this.endText = (info && info.reason === 'disconnected') ? '连接已断开' : '通话已结束'
			this.endCallLocal()
		},
		/** 本地结束(清理计时,通知 renderjs 释放媒体) */
		endCallLocal() {
			this.stopCallTimer()
			this.callState = 'ended'
			this.sendToRender({ action: 'hangup' })
		},
		// ===== 按钮事件 =====
		acceptCall() {
			if (this.callState === 'ringing') this.callState = 'incall'
			this.startCallTimer()
			const offer = this.pendingOffer ? this.pendingOffer.sdp : null
			this.sendToRender({ action: 'accept', callType: this.callType, offer })
		},
		rejectCall() {
			this.onSignalOut({ action: 'reject', to: (this.pendingOffer && this.pendingOffer.from) || this.peerUserId, sessionId: this.sessionId })
			this.endText = '已拒绝通话'
			this.endCallLocal()
		},
		hangUpCall() {
			this.onSignalOut({ action: 'hangup', duration: this.callTimer })
			this.endText = '通话已结束'
			this.endCallLocal()
		},
		switchCamera() {
			this.sendToRender({ action: 'switchCamera' })
		},
		toggleCamera() {
			this.cameraOn = !this.cameraOn
			this.sendToRender({ action: 'toggleCamera', on: this.cameraOn })
		},
		closePage() {
			uni.navigateBack()
		},
		// ===== 计时 =====
		startCallTimer() {
			this.stopCallTimer()
			this.callSeconds = 0
			this.callTimer = '00:00'
			this.timerInterval = setInterval(() => {
				this.callSeconds++
				const m = String(Math.floor(this.callSeconds / 60)).padStart(2, '0')
				const s = String(this.callSeconds % 60).padStart(2, '0')
				this.callTimer = m + ':' + s
			}, 1000)
		},
		stopCallTimer() {
			if (this.timerInterval) {
				clearInterval(this.timerInterval)
				this.timerInterval = null
			}
		}
	}
}
</script>

<script module="webrtc" lang="renderjs">
/**
 * renderjs:WebRTC 视图层实现
 * - 可操作 DOM / 使用浏览器 API(getUserMedia / RTCPeerConnection)
 * - 逻辑层指令:watch signal({action, ...})
 * - 回传:this.$ownerInstance.callMethod('onSignalOut', payload)
 */
const RTC_CONFIG = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] }

console.log('[renderjs] webrtc 模块开始加载')

export default {
	data() {
		return {
			pc: null,
			localStream: null,
			recoverTimer: null,
			callType: 'video'
		}
	},
	mounted() {
		console.log('[renderjs] webrtc mounted 触发')
		try {
			// 注意:4.87 中 $ownerInstance.$getComponentData 不存在,初始 callType 由 signal 传入即可
			this.callMethod('onRenderReady')
			console.log('[renderjs] onRenderReady 已发送')
		} catch (e) {
			console.error('[renderjs] mounted 异常', e)
			this.callMethod('onRenderError', { message: String(e && e.message || e) })
		}
	},
	watch: {
		// 双通道之一:watch data(change:prop 之外的另一条路,带防重)
		signal(val) {
			if (val) this.handleSignal(val)
		}
	},
	methods: {
		/** change:prop 桥:逻辑层 signal 变化时触发(比 watch data 可靠) */
		onSignalChange(newVal, oldVal, ownerInstance, instance) {
			if (newVal) this.handleSignal(newVal)
		},
		handleSignal(s) {
			// 防重:同一信令对象只处理一次(watch 与 change:prop 双通道可能都触发)
			const key = JSON.stringify(s)
			if (this.lastSignalKey === key) return
			this.lastSignalKey = key
			switch (s.action) {
				case 'start':
					this.callType = s.callType || 'video'
					this.startCall()
					break
				case 'accept':
					this.callType = s.callType || this.callType
					this.acceptCall(s.offer)
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
		async startCall() {
			try {
				this.createPeer()
				const stream = await this.getMedia()
				this.localStream = stream
				stream.getTracks().forEach(t => this.pc.addTrack(t, stream))
				if (this.callType === 'video') this.showLocalPreview(stream)

				const offer = await this.pc.createOffer()
				await this.pc.setLocalDescription(offer)
				this.callMethod('onSignalOut', {
					action: 'invite',
					callType: this.callType,
					sdp: offer
				})
			} catch (e) {
				console.error('发起通话失败', e)
				this.callMethod('onCallEnded', { reason: 'error', message: String(e && e.message || e) })
			}
		},
		// ===== 被叫接听 =====
		async acceptCall(offerSdp) {
			try {
				this.createPeer()
				const stream = await this.getMedia()
				this.localStream = stream
				stream.getTracks().forEach(t => this.pc.addTrack(t, stream))
				if (this.callType === 'video') this.showLocalPreview(stream)

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
		// ===== 主叫收到 answer =====
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
		async getMedia() {
			const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
			if (this.callType === 'video') {
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
					this.callMethod('onSignalOut', { action: 'candidate', candidate: e.candidate.toJSON ? e.candidate.toJSON() : e.candidate })
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
							// 自动播放被拦:提示点击启用声音
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
					// 网络抖动:8 秒恢复窗口
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
		// ===== 本地预览 =====
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
		// ===== 控制 =====
		async switchCamera() {
			if (this.callType !== 'video' || !this.localStream) return
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
		// ===== 清理 =====
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
/* renderjs 信令桥:不可见元素 */
.signal-bridge {
	position: fixed; left: -9999px; top: -9999px;
	width: 1px; height: 1px;
	opacity: 0;
}
.render-error {
	position: fixed; top: calc(20px + var(--status-bar-height)); left: 0; right: 0;
	text-align: center;
	color: #ffd666; font-size: 14px;
	z-index: 20;
	background: rgba(0,0,0,0.5);
	padding: 6px 0;
}
.call-page {
	position: fixed; inset: 0;
	background: #000;
	color: #fff;
	display: flex; align-items: center; justify-content: center;
}
.call-ui {
	width: 100%; height: 100%;
	display: flex; flex-direction: column;
	align-items: center; justify-content: center;
	position: relative;
}
.call-avatar {
	width: 84px; height: 84px; border-radius: 50%;
	background: rgba(255,255,255,0.12);
	display: flex; align-items: center; justify-content: center;
	font-size: 38px;
	margin-bottom: 20px;
}
.call-title { font-size: 20px; font-weight: 600; margin-bottom: 8px; }
.call-subtitle { font-size: 14px; color: rgba(255,255,255,0.7); margin-bottom: 40px; }
.call-ui-center { display: flex; flex-direction: column; align-items: center; justify-content: center; }

/* 视频画面 */
.call-videos {
	position: fixed; inset: 0;
	background: #000;
}
.call-remote {
	position: absolute; inset: 0;
	background: #000;
	overflow: hidden;
}
.call-remote.need-gesture::after {
	content: '点击画面启用声音';
	position: absolute; left: 0; right: 0; bottom: 30%;
	text-align: center;
	color: #fff;
	font-size: 14px;
	background: rgba(0,0,0,0.4);
	padding: 8px 0;
}
.call-remote-hidden {
	position: absolute; left: -9999px; top: -9999px;
	width: 1px; height: 1px;
	overflow: hidden;
}
.call-local {
	position: absolute; top: 16px; right: 16px;
	width: 110px; height: 150px;
	border-radius: 10px; overflow: hidden;
	background: #000;
	border: 1px solid rgba(255,255,255,0.3);
	z-index: 2;
}
.call-timer {
	position: fixed; top: calc(24px + var(--status-bar-height)); left: 0; right: 0;
	text-align: center;
	font-size: 15px; color: rgba(255,255,255,0.9);
	z-index: 5;
}
.call-btns {
	position: fixed; bottom: 60px; left: 0; right: 0;
	display: flex; align-items: center; justify-content: center;
	z-index: 5;
}
.call-btn {
	min-width: 76px; height: 44px; line-height: 44px;
	border-radius: 22px;
	font-size: 15px; font-weight: 600;
	color: #fff; text-align: center;
	padding: 0 18px; margin: 0 12px;
}
.decline { background: #fa5151; }
.accept { background: #07c160; }
.hangup { background: #fa5151; }
.ctrl { background: rgba(255,255,255,0.18); }
</style>
