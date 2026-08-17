<template>
	<view class="call-page">

		<!-- WebRTC 引擎组件(组件级 renderjs,视频容器/媒体/信令生成都在里面) -->
		<call-engine
			:signal="signal"
			:call-type="callType"
			@signal-out="onSignalOut"
			@call-ended="onCallEnded"
			@render-ready="onRenderReady"
			@render-error="onRenderError" />

		<!-- 渲染层异常提示 -->
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
			<!-- 语音:名字 + 计时(视频画面由引擎组件渲染) -->
			<view v-if="callType !== 'video'" class="call-ui-center">
				<view class="call-avatar">📞</view>
				<view class="call-title">{{ customerName || '顾客' }}</view>
				<view class="call-subtitle">{{ callTimer }}</view>
			</view>
			<view v-else class="call-timer">{{ callTimer }}</view>
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
import CallEngine from '@/components/call-engine.vue'

/**
 * 通话页(原生 renderjs WebRTC,无 web-view)
 * 职责:ws 信令收发、UI 状态、计时器、按钮事件;WebRTC 在 call-engine 组件内
 * URL 参数:sessionId peerId token name type(video|audio) mode(outgoing|incoming) auto(1=自动接听)
 */
export default {
	components: { CallEngine },
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
			signal: null,
			pendingOffer: null,
			callSeconds: 0,
			timerInterval: null,
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
		// 引擎健康检查:3 秒内没就绪则提示
		this.readyTimer = setTimeout(() => {
			if (!this.renderReady) {
				this.renderError = '通话引擎未就绪,请重新进入通话'
			}
		}, 3000)
	},
	onUnload() {
		this.stopCallTimer()
		this.signal = { action: 'hangup' }
		if (this.ws) { this.ws.close(); this.ws = null }
	},
	methods: {
		// ===== WebSocket 信令 =====
		connectWs() {
			this.ws = new ChatSocket({
				token: this.token,
				onConnected: () => {
					this.wsConnected = true
					if (this.mode === 'outgoing') {
						this.signal = { action: 'start', callType: this.callType }
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
					this.callType = payload.callType || this.callType
					this.pendingOffer = payload
					if (this.autoAccept) {
						this.acceptCall()
					} else {
						this.callState = 'ringing'
					}
					break
				case 'accept':
					if (this.callState === 'calling' && payload.sdp) {
						this.signal = { action: 'setRemote', sdp: payload.sdp }
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
						this.signal = { action: 'candidate', candidate: payload.candidate }
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
		// ===== 引擎组件事件 =====
		onRenderReady() {
			this.renderReady = true
			this.renderError = ''
			if (this.readyTimer) { clearTimeout(this.readyTimer); this.readyTimer = null }
		},
		onRenderError(info) {
			this.renderError = '通话引擎异常: ' + ((info && info.message) || '未知错误')
		},
		/** 引擎 -> ws:WebRTC 产生的信令 */
		onSignalOut(payload) {
			if (!this.ws) return
			this.ws.send(Object.assign({
				type: 'call',
				to: this.peerUserId,
				sessionId: this.sessionId
			}, payload))
		},
		onCallEnded(info) {
			if (this.callState === 'ended' || this.callState === 'idle') return
			this.endText = (info && info.reason === 'disconnected') ? '连接已断开' : '通话已结束'
			this.endCallLocal()
		},
		endCallLocal() {
			this.stopCallTimer()
			this.callState = 'ended'
			this.signal = { action: 'hangup' }
		},
		// ===== 按钮事件 =====
		acceptCall() {
			if (this.callState === 'ringing') this.callState = 'incall'
			this.startCallTimer()
			const offer = this.pendingOffer ? this.pendingOffer.sdp : null
			this.signal = { action: 'accept', callType: this.callType, offer }
		},
		rejectCall() {
			this.onSignalOut({ action: 'reject' })
			this.endText = '已拒绝通话'
			this.endCallLocal()
		},
		hangUpCall() {
			this.onSignalOut({ action: 'hangup', duration: this.callTimer })
			this.endText = '通话已结束'
			this.endCallLocal()
		},
		switchCamera() {
			this.signal = { action: 'switchCamera' }
		},
		toggleCamera() {
			this.cameraOn = !this.cameraOn
			this.signal = { action: 'toggleCamera', on: this.cameraOn }
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

<style scoped>
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
	z-index: 10;
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
.call-timer {
	position: fixed; top: calc(24px + var(--status-bar-height)); left: 0; right: 0;
	text-align: center;
	font-size: 15px; color: rgba(255,255,255,0.9);
	z-index: 11;
}
.call-btns {
	position: fixed; bottom: 60px; left: 0; right: 0;
	display: flex; align-items: center; justify-content: center;
	z-index: 11;
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
