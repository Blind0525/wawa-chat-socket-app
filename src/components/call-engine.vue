<template>
	<view>
		<!-- 参数载体:页面把 URL 参数序列化到 data-cfg,renderjs 直接读(下行通道已验证可靠) -->
		<view class="cfg-holder" :data-cfg="cfgJson"></view>
		<!-- renderjs 自治渲染的通话 UI -->
		<view id="call-ui"></view>
		<!-- 远端画面 -->
		<view id="remote-video" class="ce-remote"></view>
		<!-- 本地预览 -->
		<view id="local-video" class="ce-local"></view>
	</view>
</template>

<script>
/**
 * WebRTC 通话引擎组件(renderjs 完全自治版)
 * 页面传入 cfg(JSON 字符串:sessionId/peerId/token/name/type/mode)
 * renderjs 自己:解析参数、连接 WebSocket、收发信令、WebRTC 媒体、渲染通话 UI(含按钮事件)
 * 逻辑层不参与任何通话逻辑,只提供组件外壳
 */
export default {
	name: 'CallEngine',
	props: {
		cfg: { type: String, default: '' }
	},
	data() {
		return {
			cfgJson: ''
		}
	},
	watch: {
		cfg(v) {
			this.cfgJson = v || ''
		}
	}
}
</script>

<script module="webrtc" lang="renderjs">
/**
 * renderjs:WebRTC 通话全流程自治
 * - 读 .cfg-holder 的 data-cfg 获取参数
 * - new WebSocket 连接信令(自己收发)
 * - getUserMedia / RTCPeerConnection / offer / answer / candidate
 * - innerHTML 渲染通话 UI(按钮事件用 addEventListener 绑定)
 * 手势:所有按钮点击都在 renderjs DOM 内,保证媒体自动播放不被拦
 */
const WS_URL = 'wss://49134bd4.r20.cpolar.top/chat/ws'
const RTC_CONFIG = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] }

export default {
	data() {
		return {
			pc: null,
			localStream: null,
			recoverTimer: null,
			heartbeatTimer: null,
			callSeconds: 0,
			timerInterval: null,
			callState: 'idle' // idle | calling | ringing | incall | ended
		}
	},
	mounted() {
		this.init()
	},
	methods: {
		init() {
			// 等参数元素渲染后读取
			let tries = 0
			const waitTimer = setInterval(() => {
				tries++
				const el = document.querySelector('.cfg-holder')
				if (el && el.getAttribute('data-cfg')) {
					clearInterval(waitTimer)
					try {
						this.cfg = JSON.parse(el.getAttribute('data-cfg'))
					} catch (e) {
						this.cfg = {}
					}
					this.bootstrap()
				} else if (tries > 30) {
					clearInterval(waitTimer)
				}
			}, 200)
		},
		bootstrap() {
			const c = this.cfg || {}
			this.token = c.token || ''
			this.peerId = c.peerId || ''
			this.sessionId = c.sessionId ? Number(c.sessionId) : null
			this.mode = c.mode || 'outgoing'
			this.callType = c.type || 'video'
			this.name = c.name || ''

			if (!this.token || !this.peerId) {
				this.renderEnd('参数缺失,无法通话')
				return
			}
			if (this.mode === 'outgoing') {
				// 主叫:先显示呼叫按钮(手势),点击后连 ws 发起
				this.renderIdle()
			} else {
				// 被叫:直接连 ws 等来电
				this.connectWs()
			}
		},
		// ===== WebSocket 信令 =====
		connectWs() {
			try {
				this.ws = new WebSocket(WS_URL + '?token=' + encodeURIComponent(this.token))
			} catch (e) {
				this.renderEnd('信令连接失败')
				return
			}
			this.ws.onopen = () => {
				this.startHeartbeat()
			}
			this.ws.onmessage = (e) => {
				let obj = null
				try { obj = JSON.parse(e.data) } catch (err) { return }
				if (!obj || !obj.type) return
				if (obj.type === 'pong') return
				if (obj.type === 'call') this.handleSignal(obj)
			}
			this.ws.onclose = () => {
				this.stopHeartbeat()
			}
			this.ws.onerror = () => { /* onclose 随之触发 */ }
		},
		wsSend(obj) {
			if (this.ws && this.ws.readyState === WebSocket.OPEN) {
				this.ws.send(JSON.stringify(obj))
			}
		},
		startHeartbeat() {
			this.stopHeartbeat()
			this.heartbeatTimer = setInterval(() => {
				if (this.ws && this.ws.readyState === WebSocket.OPEN) {
					this.ws.send(JSON.stringify({ type: 'ping' }))
				}
			}, 25000)
		},
		stopHeartbeat() {
			if (this.heartbeatTimer) { clearInterval(this.heartbeatTimer); this.heartbeatTimer = null }
		},
		// ===== 信令处理 =====
		handleSignal(obj) {
			const action = obj.action
			switch (action) {
				case 'invite':
					// 来电:响铃,等用户点接听(手势)
					this.callType = obj.callType || this.callType
					this.pendingOffer = obj
					this.callState = 'ringing'
					this.renderRinging()
					break
				case 'accept':
					// 主叫:对方接听
					if (this.callState === 'calling' && obj.sdp && this.pc) {
						this.pc.setRemoteDescription(new RTCSessionDescription(obj.sdp)).catch(e => console.error('setRemote失败', e))
						this.callState = 'incall'
						this.renderIncall()
						this.startTimer()
					}
					break
				case 'reject':
					if (this.callState === 'calling') {
						this.renderEnd('对方拒绝了通话')
					}
					break
				case 'candidate':
					if (this.pc && obj.candidate) {
						this.pc.addIceCandidate(new RTCIceCandidate(obj.candidate)).catch(e => console.error('addIce失败', e))
					}
					break
				case 'hangup':
					if (this.callState !== 'idle' && this.callState !== 'ended') {
						this.renderEnd('对方已挂断')
					}
					break
			}
		},
		// ===== 主叫 =====
		btnStart() {
			// 用户点「呼叫」(手势):连 ws,连上后发起
			if (this.wsConnecting) return
			this.wsConnecting = true
			this.connectWs()
			const checkOpen = setInterval(() => {
				if (this.ws && this.ws.readyState === WebSocket.OPEN) {
					clearInterval(checkOpen)
					this.startCall()
				}
			}, 200)
		},
		async startCall() {
			this.callState = 'calling'
			this.renderCalling()
			this.startTimer()
			try {
				this.createPeer()
				const stream = await this.getMedia()
				this.localStream = stream
				stream.getTracks().forEach(t => this.pc.addTrack(t, stream))
				if (this.callType === 'video') this.showLocalPreview(stream)

				const offer = await this.pc.createOffer()
				await this.pc.setLocalDescription(offer)
				this.wsSend({ type: 'call', action: 'invite', to: this.peerId, sessionId: this.sessionId, callType: this.callType, sdp: offer })
			} catch (e) {
				console.error('发起通话失败', e)
				this.renderEnd('通话失败: ' + (e && e.message || e))
			}
		},
		// ===== 被叫 =====
		btnAccept() {
			// 用户点「接听」(手势)
			this.acceptCall()
		},
		async acceptCall() {
			this.callState = 'incall'
			this.renderIncall()
			this.startTimer()
			try {
				this.createPeer()
				const stream = await this.getMedia()
				this.localStream = stream
				stream.getTracks().forEach(t => this.pc.addTrack(t, stream))
				if (this.callType === 'video') this.showLocalPreview(stream)

				if (this.pendingOffer && this.pendingOffer.sdp) {
					await this.pc.setRemoteDescription(new RTCSessionDescription(this.pendingOffer.sdp))
				}
				const answer = await this.pc.createAnswer()
				await this.pc.setLocalDescription(answer)
				this.wsSend({ type: 'call', action: 'accept', to: this.peerId, sessionId: this.sessionId, sdp: answer })
			} catch (e) {
				console.error('接听失败', e)
				this.renderEnd('接听失败: ' + (e && e.message || e))
			}
		},
		btnReject() {
			this.wsSend({ type: 'call', action: 'reject', to: this.peerId, sessionId: this.sessionId })
			this.renderEnd('已拒绝通话')
		},
		btnHangup() {
			this.wsSend({ type: 'call', action: 'hangup', to: this.peerId, sessionId: this.sessionId, duration: this.timerText() })
			this.renderEnd('通话已结束')
		},
		// ===== WebRTC =====
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
					this.wsSend({ type: 'call', action: 'candidate', to: this.peerId, sessionId: this.sessionId, candidate: e.candidate.toJSON ? e.candidate.toJSON() : e.candidate })
				}
			}

			this.pc.ontrack = (e) => {
				const remoteStream = e.streams[0]
				if (!remoteStream) return
				const container = document.getElementById('remote-video')
				if (!container) return
				container.style.display = 'block'
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
					this.renderEnd('连接已断开')
				} else if (st === 'disconnected') {
					if (!this.recoverTimer) {
						this.recoverTimer = setTimeout(() => {
							if (this.pc && this.pc.connectionState === 'disconnected') {
								this.renderEnd('连接已断开')
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
			container.style.display = 'block'
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
		btnSwitchCamera() {
			this.switchCamera()
		},
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
		btnToggleCamera() {
			this.cameraOn = !this.cameraOn
			if (this.localStream) {
				const tracks = this.localStream.getVideoTracks()
				tracks.forEach(t => { t.enabled = this.cameraOn })
			}
			this.renderIncall()
		},
		// ===== UI 渲染(全部由 renderjs 内联样式绘制)=====
		renderIdle() {
			this.renderUI(
				'<div style="text-align:center;color:#fff;padding-top:30vh">' +
				'<div style="font-size:40px">' + (this.callType === 'video' ? '📹' : '📞') + '</div>' +
				'<div style="font-size:20px;font-weight:600;margin:16px 0 6px">' + (this.name || '顾客') + '</div>' +
				'<div style="font-size:14px;color:rgba(255,255,255,.7);margin-bottom:36px">' + (this.callType === 'video' ? '视频通话' : '语音通话') + '</div>' +
				'<button id="btn-start" style="min-width:140px;height:46px;border:none;border-radius:23px;background:#07c160;color:#fff;font-size:16px;font-weight:600">呼 叫</button>' +
				'</div>'
			)
			this.bindClick('btn-start', () => this.btnStart())
		},
		renderCalling() {
			this.renderUI(
				'<div style="text-align:center;color:#fff;padding-top:30vh">' +
				'<div style="font-size:40px">' + (this.callType === 'video' ? '📹' : '📞') + '</div>' +
				'<div style="font-size:20px;font-weight:600;margin:16px 0 6px">正在呼叫...</div>' +
				'<div style="font-size:14px;color:rgba(255,255,255,.7);margin-bottom:36px">' + (this.callType === 'video' ? '视频通话' : '语音通话') + '</div>' +
				'<button id="btn-hangup" style="min-width:140px;height:46px;border:none;border-radius:23px;background:#fa5151;color:#fff;font-size:16px;font-weight:600">取 消</button>' +
				'</div>'
			)
			this.bindClick('btn-hangup', () => this.btnHangup())
		},
		renderRinging() {
			this.renderUI(
				'<div style="text-align:center;color:#fff;padding-top:30vh">' +
				'<div style="font-size:40px">' + (this.callType === 'video' ? '📹' : '📞') + '</div>' +
				'<div style="font-size:20px;font-weight:600;margin:16px 0 6px">顾客来电</div>' +
				'<div style="font-size:14px;color:rgba(255,255,255,.7);margin-bottom:36px">' + (this.callType === 'video' ? '视频通话' : '语音通话') + '</div>' +
				'<button id="btn-reject" style="min-width:110px;height:46px;border:none;border-radius:23px;background:#fa5151;color:#fff;font-size:15px;margin-right:16px">拒 绝</button>' +
				'<button id="btn-accept" style="min-width:110px;height:46px;border:none;border-radius:23px;background:#07c160;color:#fff;font-size:15px">接 听</button>' +
				'</div>'
			)
			this.bindClick('btn-reject', () => this.btnReject())
			this.bindClick('btn-accept', () => this.btnAccept())
		},
		renderIncall() {
			const timer = this.timerText()
			const cameraBtn = this.callType === 'video'
				? '<button id="btn-camera" style="min-width:76px;height:44px;border:none;border-radius:22px;background:rgba(255,255,255,.18);color:#fff;font-size:14px;margin:0 8px">' + (this.cameraOn ? '关摄像头' : '开摄像头') + '</button>'
				: ''
			const switchBtn = this.callType === 'video'
				? '<button id="btn-switch" style="min-width:76px;height:44px;border:none;border-radius:22px;background:rgba(255,255,255,.18);color:#fff;font-size:14px;margin:0 8px">翻转</button>'
				: ''
			let html = ''
			if (this.callType === 'video') {
				html = '<div style="position:fixed;top:calc(24px + var(--status-bar-height,0px));left:0;right:0;text-align:center;color:#fff;font-size:15px;z-index:6">' + timer + '</div>'
			} else {
				html = '<div style="text-align:center;color:#fff;padding-top:30vh">' +
					'<div style="font-size:40px">📞</div>' +
					'<div style="font-size:20px;font-weight:600;margin:16px 0 6px">' + (this.name || '顾客') + '</div>' +
					'<div style="font-size:14px;color:rgba(255,255,255,.7)">' + timer + '</div>' +
					'</div>'
			}
			html += '<div style="position:fixed;bottom:60px;left:0;right:0;text-align:center;z-index:6">' +
				'<button id="btn-switch" style="min-width:76px;height:44px;border:none;border-radius:22px;background:rgba(255,255,255,.18);color:#fff;font-size:14px;margin:0 8px;display:' + (this.callType === 'video' ? 'inline-block' : 'none') + '">翻转</button>' +
				'<button id="btn-camera" style="min-width:76px;height:44px;border:none;border-radius:22px;background:rgba(255,255,255,.18);color:#fff;font-size:14px;margin:0 8px;display:' + (this.callType === 'video' ? 'inline-block' : 'none') + '">' + (this.cameraOn ? '关摄像头' : '开摄像头') + '</button>' +
				'<button id="btn-hangup" style="min-width:76px;height:44px;border:none;border-radius:22px;background:#fa5151;color:#fff;font-size:15px;font-weight:600;margin:0 8px">挂 断</button>' +
				'</div>'
			this.renderUI(html)
			this.bindClick('btn-hangup', () => this.btnHangup())
			if (this.callType === 'video') {
				this.bindClick('btn-switch', () => this.btnSwitchCamera())
				this.bindClick('btn-camera', () => this.btnToggleCamera())
			}
		},
		renderEnd(text) {
			this.callState = 'ended'
			this.stopTimer()
			this.hangup()
			const dur = this.callSeconds > 0 ? '<div style="font-size:14px;color:rgba(255,255,255,.7);margin-bottom:36px">通话时长 ' + this.timerText() + '</div>' : ''
			this.renderUI(
				'<div style="text-align:center;color:#fff;padding-top:30vh">' +
				'<div style="font-size:40px">' + (this.callType === 'video' ? '📹' : '📞') + '</div>' +
				'<div style="font-size:20px;font-weight:600;margin:16px 0 6px">' + (text || '通话已结束') + '</div>' +
				dur +
				'<div style="font-size:13px;color:rgba(255,255,255,.5)">点击左上角返回</div>' +
				'</div>'
			)
		},
		renderUI(html) {
			const el = document.getElementById('call-ui')
			if (el) el.innerHTML = html
		},
		bindClick(id, fn) {
			const el = document.getElementById(id)
			if (el) el.addEventListener('click', fn)
		},
		// ===== 计时 =====
		startTimer() {
			this.stopTimer()
			this.callSeconds = 0
			this.timerInterval = setInterval(() => {
				this.callSeconds++
				if (this.callState === 'incall') {
					const timer = this.timerText()
					const el = document.getElementById('call-ui')
					if (el && this.callType === 'video') {
						const t = el.querySelector('.call-timer-text')
						if (t) t.textContent = timer
					} else if (el && this.callType !== 'video') {
						const t = el.querySelector('.call-timer-text')
						if (t) t.textContent = timer
					}
				}
			}, 1000)
		},
		stopTimer() {
			if (this.timerInterval) { clearInterval(this.timerInterval); this.timerInterval = null }
		},
		timerText() {
			const m = String(Math.floor(this.callSeconds / 60)).padStart(2, '0')
			const s = String(this.callSeconds % 60).padStart(2, '0')
			return m + ':' + s
		},
		// ===== 清理 =====
		hangup() {
			this.stopHeartbeat()
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
				if (el) { el.innerHTML = ''; el.style.display = 'none' }
			})
		}
	}
}
</script>

<style scoped>
.cfg-holder {
	position: fixed; left: -9999px; top: -9999px;
	width: 1px; height: 1px;
	opacity: 0;
}
/* 远端画面:默认隐藏,renderjs 收到流时 display:block */
.ce-remote {
	position: fixed; inset: 0;
	background: #000;
	display: none;
	overflow: hidden;
	z-index: 1;
}
.ce-remote.need-gesture::after {
	content: '点击画面启用声音';
	position: absolute; left: 0; right: 0; bottom: 30%;
	text-align: center;
	color: #fff;
	font-size: 14px;
	background: rgba(0,0,0,0.4);
	padding: 8px 0;
}
/* 本地小窗 */
.ce-local {
	position: fixed; top: 16px; right: 16px;
	width: 110px; height: 150px;
	border-radius: 10px; overflow: hidden;
	background: #000;
	border: 1px solid rgba(255,255,255,0.3);
	display: none;
	z-index: 2;
}
/* renderjs 渲染的 UI 层 */
#call-ui {
	position: fixed; inset: 0;
	z-index: 5;
	pointer-events: auto;
}
</style>
