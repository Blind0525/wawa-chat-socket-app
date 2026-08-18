<template>
	<!-- 加载中 -->
	<view v-if="pageState === 'loading'" class="cs-login">
		<view class="cs-login-card">
			<view class="cs-loading-spinner"></view>
			<text class="cs-login-tip">{{ loadingText }}</text>
		</view>
	</view>

	<!-- 错误提示 -->
	<view v-else-if="pageState === 'error'" class="cs-login">
		<view class="cs-login-card">
			<view class="cs-login-logo">在线客服</view>
			<text class="cs-login-tip">{{ errorText }}</text>
			<button class="cs-login-btn" @click="reload">重新加载</button>
		</view>
	</view>

	<!-- 聊天页 -->
	<view v-else class="cs-overlay">
		<view class="cs-header">
			<view class="cs-back" @click="goBack">‹</view>
			<text class="cs-title">{{ customerName || '在线客服' }}</text>
			<text v-if="!wsConnected" class="cs-connecting">连接中...</text>
		</view>

		<scroll-view class="cs-body" scroll-y :scroll-into-view="scrollIntoId" :scroll-with-animation="false" @scroll="onBodyScroll">
			<view v-for="(msg, i) in chatMsgs" :key="msg.localId || msg.id" :id="'msg-' + (msg.localId || msg.id)" class="cs-msg" :class="[msg.mine ? 'cs-msg-right' : 'cs-msg-left', msg.type === 'call' ? 'cs-call-record' : '']">
				<!-- 日期分隔条 -->
				<view v-if="i === 0 || (msg.day || '今天') !== (chatMsgs[i - 1].day || '今天')" class="cs-date-divider">{{ msg.day || '今天' }}</view>
				<!-- 通话记录 -->
				<view v-if="msg.type === 'call'" class="cs-bubble cs-call-bubble">
					<text class="cs-call-ico">{{ msg.callType === 'video' ? '📹' : '📞' }}</text>
					<text class="cs-call-text">{{ msg.text }}</text>
					<text v-if="msg.duration && msg.duration !== '00:00'" class="cs-call-dur">{{ msg.duration }}</text>
				</view>
				<template v-else>
					<!-- 头像 -->
					<view class="cs-avatar">{{ msg.mine ? '我' : '客' }}</view>
					<view class="cs-msg-main">
						<!-- 文本消息 -->
						<view v-if="msg.type === 'text'" class="cs-bubble">{{ msg.text }}</view>
						<!-- 图片消息 -->
						<view v-else-if="msg.type === 'image'" class="cs-bubble cs-image-bubble" @click="openPreview('image', msg.url)">
							<image class="cs-image-preview" :src="msg.url" mode="widthFix" />
							<view v-if="msg.sending" class="cs-sending">发送中...</view>
						</view>
						<!-- 视频消息 -->
						<view v-else-if="msg.type === 'video'" class="cs-bubble cs-video-bubble" @click="openPreview('video', msg.url)">
							<video class="cs-video-preview" :src="msg.url" :controls="false" :show-center-play-btn="false" object-fit="cover" />
							<view class="cs-play-icon">▶</view>
							<view v-if="msg.sending" class="cs-sending">发送中...</view>
						</view>
						<!-- 语音消息 -->
						<view v-else-if="msg.type === 'voice'" class="cs-bubble cs-voice-bubble" @click="toggleVoice(msg)">
							<text class="cs-voice-icon">{{ msg.playing ? '⏹' : '▶' }}</text>
							<text v-if="msg.duration" class="cs-voice-duration">{{ msg.duration }}″</text>
							<text v-if="msg.sending" class="cs-sending-inline"> 发送中...</text>
						</view>
						<!-- 文件消息 -->
						<view v-else-if="msg.type === 'file'" class="cs-bubble cs-file-bubble" @click="openFile(msg)">
							<view class="cs-file-icon">📄</view>
							<view class="cs-file-info">
								<view class="cs-file-name">{{ msg.fileName }}</view>
								<view class="cs-file-size">{{ formatFileSize(msg.fileSize) }}</view>
							</view>
							<view v-if="msg.sending" class="cs-sending-inline"> 发送中...</view>
						</view>
						<text v-if="msg.time" class="cs-time">{{ msg.time }}</text>
					</view>
				</template>
			</view>
			<view id="msg-bottom" class="cs-bottom-anchor"></view>
		</scroll-view>

		<view class="cs-input-bar">
			<view class="cs-tools-row">
				<view class="cs-tool-btn" @click="pickImage" :class="{ 'cs-disabled': !wsConnected }">🖼</view>
				<view class="cs-tool-btn" @click="pickVideo" :class="{ 'cs-disabled': !wsConnected }">🎬</view>
				<view class="cs-tool-btn" @click="pickFile" :class="{ 'cs-disabled': !wsConnected }">📎</view>
				<view class="cs-tool-btn" @click="showCallMenu" :class="{ 'cs-disabled': !wsConnected }">📞</view>
			</view>
			<view class="cs-input-row">
				<view class="cs-voice-input-btn" :class="{ 'cs-active': voiceMode }" @click="toggleVoiceMode" :title="voiceMode ? '切换键盘' : '按住说话'">🎤</view>
				<!-- 按住说话 -->
				<view v-if="voiceMode" class="cs-press-talk" :class="{ 'cs-press-active': isPressing, 'cs-press-cancel': pressCancel }"
					@touchstart="startPressRecord" @touchmove="onPressMove" @touchend="endPressRecord" @touchcancel="endPressRecord">
					<text>{{ pressCancel ? '松开手指,取消发送' : (isPressing ? '松开 结束' : '按住 说话') }}</text>
				</view>
				<!-- 键盘输入 -->
				<template v-else>
					<input class="cs-input" v-model="chatText" placeholder="输入消息..." placeholder-class="cs-ph" confirm-type="send" @confirm="sendMsg" :disabled="!wsConnected" />
					<view class="cs-send" @click="sendMsg">发送</view>
				</template>
			</view>
		</view>
	</view>

	<!-- 视频预览覆盖层 -->
	<view v-if="preview.show" class="cs-preview-overlay" @click="closePreview">
		<video v-if="preview.type === 'video'" class="cs-preview-media" :src="preview.url" autoplay controls @click.stop />
		<image v-else class="cs-preview-media" :src="preview.url" mode="aspectFit" @click.stop />
		<view class="cs-preview-close" @click="closePreview">✕</view>
	</view>
</template>

<script>
import { getMessagesApi, markReadApi, uploadChatFile } from '@/api/index'
import { ChatSocket } from '@/utils/ws'
import { getAuth } from '@/utils/storage'

// 通话 H5 地址(独立通话页,部署在客服端 H5 同域)
const CALL_H5_BASE = 'https://wecom.offgkc.com/socket2/call'

export default {
	data() {
		return {
			pageState: 'loading',
			loadingText: '正在加载会话...',
			errorText: '',
			chatMsgs: [],
			chatText: '',
			scrollIntoId: '',
			wsConnected: false,
			customerName: '',
			voiceMode: false,
			isPressing: false,
			pressCancel: false,
			preview: { show: false, type: 'image', url: '' },
			peerUserId: null,
			sessionId: null
		}
	},
	onLoad(options) {
		this.sessionId = Number(options.sessionId) || null
		this.peerUserId = options.peerId || null
		this.customerName = options.customerName || ''
		if (!this.sessionId || !this.peerUserId) {
			this.pageState = 'error'
			this.errorText = '缺少会话参数'
			return
		}
		this.agentInit()
	},
	onHide() {
		// 延迟销毁 ws:给正在上传的媒体消息收尾(上传完成后仍需 ws 发送,避免图片/视频丢失)
		if (this.wsCloseTimer) { clearTimeout(this.wsCloseTimer); this.wsCloseTimer = null }
		this.wsCloseTimer = setTimeout(() => this.destroyWs(), 8000)
	},
	onShow() {
		// 回到页面:取消延迟销毁
		if (this.wsCloseTimer) { clearTimeout(this.wsCloseTimer); this.wsCloseTimer = null }
		// 从通话页/其他页返回:重新拉历史(通话记录、通话期间的新消息)
		if (this.pageState === 'chat' && this.sessionId) {
			this.loadHistoryMessages().then(() => this.scrollToBottom(true))
		}
	},
	onUnload() {
		this.destroyWs()
		this.stopVoice()
	},
	methods: {
		async agentInit() {
			this.pageState = 'loading'
			try {
				this.connectWs()
				await this.loadHistoryMessages()
				markReadApi(this.sessionId).catch(e => console.log('标记已读失败', e.message))
				this.pageState = 'chat'
				this.scrollToBottom(true)
			} catch (e) {
				console.error(e)
				this.pageState = 'error'
				this.errorText = '加载失败: ' + (e.message || e)
			}
		},
		reload() {
			this.agentInit()
		},
		goBack() {
			uni.navigateBack()
		},
		// ===== WebSocket =====
		connectWs() {
			const auth = getAuth()
			if (!auth || !auth.token) {
				uni.reLaunch({ url: '/pages/login/login' })
				return
			}
			this.ws = new ChatSocket({
				token: auth.token,
				onConnected: () => { this.wsConnected = true },
				onMsg: (data) => {
					if (data.sessionId && Number(data.sessionId) !== Number(this.sessionId)) return
					const formatted = this.formatMsg(data)
					if (formatted) {
						this.chatMsgs.push(formatted)
						this.scrollToBottom()
					}
				},
				onCall: (payload) => this.handleCallMessage(payload),
				onAck: (localId, data) => {
					const idx = this.chatMsgs.findIndex(m => m.localId === localId)
					if (idx >= 0) {
						this.chatMsgs[idx].id = data.id
						if (data.fileUrl && this.chatMsgs[idx].url && this.chatMsgs[idx].url.indexOf('http') !== 0) {
							this.chatMsgs[idx].url = data.fileUrl
						}
					}
				},
				onError: (msg) => { console.log('连接错误:', msg) },
				onClose: () => { this.wsConnected = false }
			})
			this.ws.connect()
		},
		destroyWs() {
			if (this.ws) { this.ws.close(); this.ws = null }
			this.wsConnected = false
		},
		wsSend(obj) {
			if (this.ws) this.ws.send(obj)
		},
		// ===== 通话信令入口(来电弹窗确认后跳转通话页)=====
		handleCallMessage(payload) {
			if (!payload || payload.type !== 'call') return
			if (payload.action === 'invite') {
				// 来电:弹窗确认后跳转通话页(通话页 H5 连 ws 后由后端补发 invite)
				const isVideo = payload.callType === 'video'
				uni.showModal({
					title: '顾客来电',
					content: isVideo ? '视频通话邀请' : '语音通话邀请',
					confirmText: '接听',
					cancelText: '拒绝',
					success: (res) => {
						if (res.confirm) {
							this.gotoCall('incoming', isVideo ? 'video' : 'audio', true)
						} else {
							this.wsSend({ type: 'call', action: 'reject', to: payload.from, sessionId: this.sessionId })
						}
					}
				})
			}
			// 其他信令(accept/reject/candidate/hangup)由通话页 H5 处理
		},
		showCallMenu() {
			uni.showActionSheet({
				itemList: ['语音通话', '视频通话'],
				success: (res) => {
					this.gotoCall('outgoing', res.tapIndex === 0 ? 'audio' : 'video', false)
				}
			})
		},
		/** 跳转通话页(mode=outgoing 主叫 / incoming 被叫;auto=1 已在弹窗确认接听) */
		gotoCall(mode, callType, autoAccept) {
			// 通话页 H5 会重连 ws,立即关闭当前 ws 避免冲突
			this.destroyWs()
			const auth = getAuth() || {}
			uni.navigateTo({
				url: '/pages/call/call?sessionId=' + this.sessionId
					+ '&peerId=' + encodeURIComponent(this.peerUserId || '')
					+ '&token=' + encodeURIComponent(auth.token || '')
					+ '&name=' + encodeURIComponent(this.customerName || '')
					+ '&type=' + callType + '&mode=' + mode + '&auto=' + (autoAccept ? '1' : '0')
			})
		},
		// ===== 历史消息 =====
		async loadHistoryMessages() {
			if (!this.sessionId) return
			try {
				// 后端按时间正序分页:先查总数,加载最后两页取最后 30 条(最后一页不满 30 条时凑数)
				const size = 30
				const first = await getMessagesApi({ sessionId: this.sessionId, page: { page: 1, size } })
				const total = (first || {}).total || 0
				const pages = Math.max(1, Math.ceil(total / size))
				const pageNums = pages >= 2 ? [pages - 1, pages] : [pages]
				const all = []
				for (const p of pageNums) {
					const res = await getMessagesApi({ sessionId: this.sessionId, page: { page: p, size } })
					all.push(...(((res || {}).list) || []))
				}
				const list = all.slice(-size)
				this.chatMsgs = list.map(m => this.formatMsg(m)).filter(Boolean)
				this.historyPage = pages >= 2 ? pages - 1 : pages
				this.historyHasMore = this.historyPage > 1
			} catch (e) {
				console.log('加载历史消息失败', e.message)
			}
		},
		async loadOlderMessages() {
			if (!this.sessionId || this.historyLoading || !this.historyHasMore) return
			this.historyLoading = true
			try {
				// 加载更早一页(倒数第 historyPage-1 页),插入列表头部
				const res = await getMessagesApi({ sessionId: this.sessionId, page: { page: (this.historyPage || 0) - 1, size: 30 } })
				const older = ((res || {}).list || []).map(m => this.formatMsg(m)).filter(Boolean)
				if (older.length > 0) {
					// 记录原第一条消息,加载后滚动到它(视觉保持不跳动)
					const anchorKey = this.chatMsgs[0] ? ('msg-' + (this.chatMsgs[0].localId || this.chatMsgs[0].id)) : 'msg-bottom'
					this.chatMsgs = older.concat(this.chatMsgs)
					this.historyPage--
					this.historyHasMore = this.historyPage > 1
					this.$nextTick(() => {
						this.scrollIntoId = anchorKey
					})
				} else {
					this.historyHasMore = false
				}
			} catch (e) {
				console.log('加载更早消息失败', e.message)
			}
			this.historyLoading = false
		},
		onBodyScroll(e) {
			// 滚动到顶部附近(50px 内)加载更早消息(scrolltoupper 在 App 端不可靠,用 scroll 位置判断)
			const top = (e && e.detail && e.detail.scrollTop) || 0
			if (top < 50) this.loadOlderMessages()
		},
		// ===== 消息格式化 =====
		formatDay(d) {
			if (!d) return null
			const now = new Date()
			const same = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
			if (same(d, now)) return '今天'
			const yest = new Date(now); yest.setDate(now.getDate() - 1)
			if (same(d, yest)) return '昨天'
			return (d.getMonth() + 1) + '月' + d.getDate() + '日'
		},
		formatMsg(m) {
			if (!m) return null
			const time = m.createTime ? new Date(String(m.createTime).replace(' ', 'T')) : new Date()
			const hh = String(time.getHours()).padStart(2, '0')
			const mm = String(time.getMinutes()).padStart(2, '0')
			const auth = getAuth() || {}
			const base = {
				mine: m.senderImId === auth.userId,
				time: hh + ':' + mm,
				day: this.formatDay(time)
			}
			switch (m.messageType) {
				case 'TEXT':
					return Object.assign({}, base, { type: 'text', text: m.content || '' })
				case 'IMAGE':
					return Object.assign({}, base, { type: 'image', url: m.fileUrl || m.content || '' })
				case 'VIDEO':
					return Object.assign({}, base, { type: 'video', url: m.fileUrl || m.content || '' })
				case 'FILE':
					return Object.assign({}, base, { type: 'file', url: m.fileUrl, fileName: m.fileName || m.content || '文件', fileSize: m.fileSize })
				case 'AUDIO': {
					let duration = 0
					try { if (m.customData) duration = Number(JSON.parse(m.customData).duration) || 0 } catch (e) { /* ignore */ }
					return Object.assign({}, base, { type: 'voice', url: m.fileUrl || m.content || '', duration, playing: false })
				}
				case 'SYSTEM': {
					let callTypeStr = 'audio', duration = null
					try {
						if (m.customData) {
							const cd = JSON.parse(m.customData)
							callTypeStr = cd.callType || 'audio'
							duration = cd.duration || null
						}
					} catch (e) { /* ignore */ }
					return Object.assign({}, base, { type: 'call', callType: callTypeStr, text: m.content || '通话', duration })
				}
				default:
					return null
			}
		},
		// ===== 滚动 =====
		scrollToBottom(force) {
			this.$nextTick(() => {
				this.scrollIntoId = ''
				this.$nextTick(() => {
					this.scrollIntoId = 'msg-bottom'
				})
			})
		},
		// ===== 发送文本 =====
		sendMsg() {
			const text = (this.chatText || '').trim()
			if (!text || !this.wsConnected || !this.peerUserId) return
			const localId = this.genLocalId()
			this.chatMsgs.push({
				localId, type: 'text', text, mine: true,
				time: this.nowTime(), day: '今天'
			})
			this.chatText = ''
			this.scrollToBottom()
			this.wsSend({ type: 'text', to: this.peerUserId, sessionId: this.sessionId, content: text, localId })
		},
		// ===== 媒体消息 =====
		async uploadAndSend(filePath, msgType, extra) {
			try {
				const d = await uploadChatFile(filePath)
				// 上传成功立即用真实 URL 替换本地预览
				if (extra && extra.localId) {
					const idx = this.chatMsgs.findIndex(m => m.localId === extra.localId)
					if (idx >= 0) {
						if (this.chatMsgs[idx].url && this.chatMsgs[idx].url.indexOf('http') !== 0) {
							this.chatMsgs[idx].url = d.url
						}
						this.chatMsgs[idx].sending = false
					}
				}
				this.wsSend(Object.assign({
					type: msgType,
					to: this.peerUserId,
					sessionId: this.sessionId,
					url: d.url,
					fileName: d.fileName || '',
					fileSize: d.fileSize || 0
				}, extra || {}))
			} catch (e) {
				console.error('上传失败', e)
				if (extra && extra.localId) {
					const idx = this.chatMsgs.findIndex(m => m.localId === extra.localId)
					if (idx >= 0) this.chatMsgs[idx].sending = false
				}
				uni.showToast({ title: '上传失败: ' + (e.message || '未知错误'), icon: 'none' })
			}
		},
		pickImage() {
			const self = this
			uni.chooseImage({
				count: 1,
				success(res) {
					const filePath = res.tempFilePaths[0]
					if (!filePath || !self.peerUserId) return
					// 压缩图片(原图可能几 MB,压缩后上传快)
					uni.compressImage({
						src: filePath,
						quality: 80,
						success: (cres) => {
							self.addImageMsg(cres.tempFilePath)
						},
						fail: () => {
							// 压缩失败用原图
							self.addImageMsg(filePath)
						}
					})
				}
			})
		},
		addImageMsg(filePath) {
			const localId = this.genLocalId()
			this.chatMsgs.push({
				localId, type: 'image', url: filePath, mine: true, sending: true,
				time: this.nowTime(), day: '今天'
			})
			this.scrollToBottom()
			this.uploadAndSend(filePath, 'image', { localId })
		},
		pickVideo() {
			const self = this
			uni.chooseVideo({
				count: 1,
				sourceType: ['album', 'camera'],
				success(res) {
					const filePath = res.tempFilePath
					if (!filePath || !self.peerUserId) return
					const localId = self.genLocalId()
					self.chatMsgs.push({
						localId, type: 'video', url: filePath, mine: true, sending: true,
						time: self.nowTime(), day: '今天'
					})
					self.scrollToBottom()
					self.uploadAndSend(filePath, 'video', { localId })
				}
			})
		},
		pickFile() {
			const self = this
			uni.chooseFile({
				count: 1,
				success(res) {
					const f = res.tempFiles && res.tempFiles[0]
					if (!f || !self.peerUserId) return
					if (f.size > 100 * 1024 * 1024) {
						uni.showToast({ title: '文件大小不能超过 100MB', icon: 'none' })
						return
					}
					const localId = self.genLocalId()
					self.chatMsgs.push({
						localId, type: 'file', fileName: f.name, fileSize: f.size, url: f.path, mine: true, sending: true,
						time: self.nowTime(), day: '今天'
					})
					self.scrollToBottom()
					self.uploadAndSend(f.path, 'file', { localId })
				}
			})
		},
		openFile(msg) {
			if (msg.url) {
				uni.setClipboardData({ data: msg.url, success: () => uni.showToast({ title: '文件地址已复制', icon: 'none' }) })
			}
		},
		// ===== 语音录制(按住说话)=====
		toggleVoiceMode() {
			this.voiceMode = !this.voiceMode
			if (!this.voiceMode && this.isRecording) {
				this.pressCancel = true
				this.stopRecord()
			}
		},
		startPressRecord() {
			if (this.isRecording || !this.wsConnected || !this.peerUserId) return
			this.pressCancel = false
			this.isPressing = true
			this.recordStartTime = Date.now()
			const recorder = uni.getRecorderManager()
			this.recorder = recorder
			recorder.onStop((res) => this.onRecordStop(res))
			recorder.onError((err) => {
				console.log('录音错误', err)
				this.isPressing = false
				uni.showToast({ title: '无法访问麦克风', icon: 'none' })
			})
			try {
				recorder.start({ format: 'mp3', duration: 60000 })
				this.isRecording = true
			} catch (e) {
				this.isPressing = false
				uni.showToast({ title: '录音启动失败', icon: 'none' })
			}
		},
		endPressRecord() {
			if (this.isRecording) {
				this.stopRecord()
			} else {
				this.isPressing = false
			}
		},
		stopRecord() {
			if (this.recorder) {
				try { this.recorder.stop() } catch (e) { /* ignore */ }
			}
		},
		onRecordStop(res) {
			this.isRecording = false
			this.isPressing = false
			if (!res.tempFilePath) return
			const durationMs = Date.now() - (this.recordStartTime || Date.now())
			if (durationMs < 1000) {
				if (!this.pressCancel) uni.showToast({ title: '说话时间太短', icon: 'none' })
				this.pressCancel = false
				return
			}
			if (this.pressCancel) {
				this.pressCancel = false
				return
			}
			const duration = Math.max(1, Math.round(durationMs / 1000))
			const localId = this.genLocalId()
			this.chatMsgs.push({
				localId, type: 'voice', url: res.tempFilePath, duration, mine: true, playing: false, sending: true,
				time: this.nowTime(), day: '今天'
			})
			this.scrollToBottom()
			this.uploadAndSend(res.tempFilePath, 'voice', { localId, duration: String(duration) })
		},
		onPressMove(e) {
			if (!this.isPressing) return
			// 简化:移出按钮 60px 视为取消(uni-app 里用触摸点坐标粗略判断)
			const touch = e.touches && e.touches[0]
			if (!touch) return
			const query = uni.createSelectorQuery().in(this)
			query.select('.cs-press-talk').boundingClientRect((rect) => {
				if (!rect) return
				const inside = touch.clientX >= rect.left - 30 && touch.clientX <= rect.right + 30 &&
					touch.clientY >= rect.top - 60 && touch.clientY <= rect.bottom + 60
				this.pressCancel = !inside
			}).exec()
		},
		// ===== 语音播放 =====
		toggleVoice(msg) {
			if (msg.playing) {
				this.stopVoice()
				return
			}
			// 先停止其他播放
			this.chatMsgs.forEach(m => { if (m !== msg) m.playing = false })
			this.stopVoice()
			msg.playing = true
			const audio = uni.createInnerAudioContext()
			this.audioCtx = audio
			audio.src = msg.url
			audio.play()
			audio.onEnded(() => {
				msg.playing = false
				audio.destroy()
				if (this.audioCtx === audio) this.audioCtx = null
			})
			audio.onError(() => {
				msg.playing = false
				audio.destroy()
				if (this.audioCtx === audio) this.audioCtx = null
			})
		},
		stopVoice() {
			if (this.audioCtx) {
				try {
					this.audioCtx.stop()
					this.audioCtx.destroy()
				} catch (e) { /* ignore */ }
				this.audioCtx = null
			}
			this.chatMsgs.forEach(m => { if (m.playing) m.playing = false })
		},
		// ===== 工具 =====
		openPreview(type, url) {
			if (!url) return
			if (type === 'image') {
				uni.previewImage({ urls: [url] })
			} else {
				this.preview = { show: true, type: 'video', url }
			}
		},
		closePreview() {
			this.preview.show = false
		},
		formatFileSize(bytes) {
			if (!bytes) return ''
			if (bytes < 1024) return bytes + ' B'
			if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
			return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
		},
		genLocalId() {
			return 'l' + Date.now() + Math.random().toString(36).slice(2, 7)
		},
		nowTime() {
			const d = new Date()
			return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0')
		}
	}
}
</script>

<style scoped>
/* 加载/错误页 */
.cs-login {
	position: fixed; inset: 0; z-index: 999;
	background: #f5f5f5;
	display: flex; align-items: center; justify-content: center;
	padding: 24px;
}
.cs-login-card {
	width: 100%; max-width: 360px;
	background: #fff; border-radius: 16px;
	padding: 32px 24px;
	display: flex; flex-direction: column; align-items: center;
}
.cs-login-logo { font-size: 22px; font-weight: 700; color: #1677ff; margin-bottom: 8px; }
.cs-login-tip { font-size: 13px; color: #999; margin-bottom: 24px; text-align: center; }
.cs-loading-spinner {
	width: 32px; height: 32px;
	border: 3px solid #e5e5e5; border-top-color: #1677ff;
	border-radius: 50%;
	animation: cs-spin 0.8s linear infinite;
	margin-bottom: 16px;
}
@keyframes cs-spin { to { transform: rotate(360deg); } }
.cs-login-btn {
	width: 100%; height: 44px; line-height: 44px;
	border-radius: 10px; background: #1677ff; color: #fff; font-size: 15px;
}
.cs-login-btn::after { border: none; }

/* 聊天页(微信风格) */
.cs-overlay {
	position: fixed; inset: 0; z-index: 999;
	background: #ededed;
	display: flex; flex-direction: column;
}
.cs-header {
	display: flex; align-items: center;
	padding: 10px 8px;
	padding-top: calc(10px + var(--status-bar-height));
	background: #f7f7f7;
	border-bottom: 1px solid #d9d9d9;
	position: relative; z-index: 10; flex-shrink: 0;
}
.cs-back {
	width: 34px; height: 34px;
	font-size: 28px; line-height: 1; color: #111;
	display: flex; align-items: center; justify-content: center;
}
.cs-title {
	flex: 1; text-align: center;
	font-size: 17px; font-weight: 500;
	margin-right: 34px;
}
.cs-connecting { font-size: 12px; color: #999; position: absolute; right: 12px; }

.cs-body { flex: 1; padding: 12px 12px 20px; height: 0; }
.cs-msg { display: flex; align-items: flex-start; margin-bottom: 16px; }
.cs-msg-left { flex-direction: row; }
.cs-msg-right { flex-direction: row-reverse; }
.cs-avatar {
	width: 38px; height: 38px; border-radius: 6px;
	display: flex; align-items: center; justify-content: center;
	font-size: 15px; font-weight: 600; color: #fff; flex-shrink: 0;
}
.cs-msg-left .cs-avatar { background: #1677ff; }
.cs-msg-right .cs-avatar { background: #b0b6bf; }
.cs-msg-main {
	max-width: 68%;
	margin: 0 10px;
	display: flex; flex-direction: column;
	min-width: 0;
}
.cs-msg-left .cs-msg-main { align-items: flex-start; }
.cs-msg-right .cs-msg-main { align-items: flex-end; }
.cs-bubble {
	padding: 9px 12px;
	border-radius: 6px; font-size: 15px;
	line-height: 1.45; word-break: break-all;
	position: relative; color: #111;
}
.cs-msg-left .cs-bubble { background: #fff; }
.cs-msg-right .cs-bubble { background: #95ec69; }
.cs-time { font-size: 10px; color: #b2b2b2; margin-top: 4px; padding: 0 2px; }
.cs-date-divider {
	text-align: center;
	font-size: 12px; color: #b2b2b2;
	margin: 6px 0 14px; width: 100%;
}
/* 通话记录 */
.cs-call-record { padding: 0 48px; }
.cs-call-bubble {
	display: flex; align-items: center;
	max-width: 68%; white-space: nowrap;
}
.cs-call-ico { font-size: 15px; margin-right: 6px; }
.cs-call-text { font-size: 14px; }
.cs-call-dur { font-size: 12px; opacity: 0.65; margin-left: 6px; }
/* 图片消息 */
.cs-image-bubble { padding: 4px; background: transparent !important; }
.cs-image-preview { width: 160px; border-radius: 6px; display: block; }
/* 视频消息 */
.cs-video-bubble { padding: 4px; background: transparent !important; position: relative; }
.cs-video-preview { width: 180px; height: 120px; border-radius: 6px; display: block; background: #000; }
.cs-play-icon {
	position: absolute; left: 50%; top: 50%;
	transform: translate(-50%, -50%);
	width: 36px; height: 36px; border-radius: 50%;
	background: rgba(0,0,0,0.5); color: #fff;
	display: flex; align-items: center; justify-content: center;
	font-size: 16px;
}
/* 语音消息 */
.cs-voice-bubble { display: flex; align-items: center; min-width: 80px; }
.cs-voice-icon { font-size: 14px; margin-right: 8px; }
.cs-voice-duration { font-size: 14px; }
/* 文件消息 */
.cs-file-bubble { display: flex; align-items: center; }
.cs-file-icon { font-size: 20px; margin-right: 10px; }
.cs-file-name { font-size: 14px; max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cs-file-size { font-size: 11px; color: #999; margin-top: 2px; }
.cs-sending {
	position: absolute; left: 0; right: 0; top: 0; bottom: 0;
	background: rgba(0,0,0,0.35); color: #fff; font-size: 12px;
	display: flex; align-items: center; justify-content: center;
	border-radius: 6px;
}
.cs-sending-inline { font-size: 11px; color: #999; }
.cs-bottom-anchor { height: 1px; }

/* 输入区 */
.cs-input-bar {
	flex-shrink: 0;
	background: #f7f7f7;
	border-top: 1px solid #d9d9d9;
	padding: 8px 10px calc(8px + env(safe-area-inset-bottom));
}
.cs-tools-row { display: flex; margin-bottom: 8px; }
.cs-tool-btn {
	width: 40px; height: 40px; border-radius: 8px;
	background: #fff; font-size: 18px;
	display: flex; align-items: center; justify-content: center;
	margin-right: 10px;
}
.cs-tool-btn.cs-disabled { opacity: 0.4; }
.cs-input-row { display: flex; align-items: center; }
.cs-voice-input-btn {
	width: 40px; height: 40px; border-radius: 8px;
	background: #fff; font-size: 18px;
	display: flex; align-items: center; justify-content: center;
	margin-right: 10px;
}
.cs-voice-input-btn.cs-active { background: #95ec69; }
.cs-press-talk {
	flex: 1; height: 40px; border-radius: 8px;
	background: #fff; border: 1px solid #d9d9d9;
	display: flex; align-items: center; justify-content: center;
	font-size: 14px; color: #333;
}
.cs-press-talk.cs-press-active { background: #d9d9d9; }
.cs-press-talk.cs-press-cancel { color: #e54d42; }
.cs-input {
	flex: 1; height: 40px; border-radius: 8px;
	background: #fff; padding: 0 12px; font-size: 15px;
}
.cs-ph { color: #b2b2b2; }
.cs-send {
	width: 60px; height: 40px; line-height: 40px;
	background: #07c160; color: #fff; font-size: 14px;
	text-align: center; border-radius: 8px; margin-left: 10px;
}

/* 视频预览 */
.cs-preview-overlay {
	position: fixed; inset: 0; z-index: 9999;
	background: rgba(0,0,0,0.92);
	display: flex; align-items: center; justify-content: center;
}
.cs-preview-media { width: 100%; height: 100%; }
.cs-preview-close {
	position: absolute; top: calc(20px + var(--status-bar-height)); right: 16px;
	width: 32px; height: 32px; border-radius: 50%;
	background: rgba(255,255,255,0.2); color: #fff;
	display: flex; align-items: center; justify-content: center;
	font-size: 16px; z-index: 10;
}
</style>
