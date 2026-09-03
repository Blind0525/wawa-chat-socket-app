<template>
	<view class="ah-page">
		<view class="ah-header">
			<text class="ah-title">客服工作台</text>
			<text class="ah-logout" @click="logout">退出</text>
		</view>

		<!-- 顶部搜索:按昵称/聊天内容匹配 -->
		<view class="ah-search">
			<text class="ah-search-ico">&#128269;</text>
			<input class="ah-search-input" v-model="searchKeyword" placeholder="搜索昵称/聊天内容"
				placeholder-class="ah-search-ph" confirm-type="search" @input="onSearchInput" @confirm="doSearch" />
			<text v-if="searchKeyword" class="ah-search-clear" @click="clearSearch">&#10005;</text>
		</view>

		<view v-if="loading && sessions.length === 0" class="ah-tip">加载中...</view>
		<view v-else-if="sessions.length === 0" class="ah-tip">{{ searching ? '未找到相关会话' : '暂无会话' }}</view>

		<scroll-view v-else class="ah-list-scroll" scroll-y :scroll-into-view="scrollIntoId" scroll-with-animation>
			<view class="ah-list">
				<view v-for="s in sessions" :key="s.id" :id="'sess-' + s.id" class="ah-item" @click="openChat(s)">
					<view class="ah-avatar">{{ (s.customerName || '客').slice(0, 1) }}</view>
					<view class="ah-main">
						<view class="ah-row1">
							<text class="ah-name">{{ s.customerName || '微信用户' }}</text>
							<text class="ah-time">{{ fmtTime(s.lastMessageTime) }}</text>
						</view>
						<view class="ah-row2">
							<text class="ah-last" :class="{ 'ah-unread': s.unreadCount > 0 }">{{ preview(s) }}</text>
							<view v-if="s.unreadCount > 0" class="ah-badge">{{ s.unreadCount > 99 ? '99+' : s.unreadCount }}</view>
						</view>
					</view>
				</view>
			</view>
		</scroll-view>

		<!-- 底部未读消息悬浮条:点击定位到最新未读会话(搜索时隐藏) -->
		<view v-if="totalUnread > 0 && !searching" class="ah-unread-float" @click="jumpToUnread">
			<view class="ah-unread-num">{{ totalUnread > 99 ? '99+' : totalUnread }}</view>
			<text class="ah-unread-text">未读消息</text>
		</view>
	</view>
</template>

<script>
import { mySessionListApi, searchSessionsApi, unregisterDeviceApi } from '@/api/index'
import { ChatSocket } from '@/utils/ws'
import { getAuth, clearAuth, getPushId } from '@/utils/storage'

export default {
	data() {
		return {
			sessions: [],
			loading: false,
			// 顶部搜索
			searchKeyword: '',
			searching: false,
			searchTimer: null,
			searchSeq: 0,
			// 底部未读悬浮条
			totalUnread: 0,
			scrollIntoId: ''
		}
	},
	onShow() {
		this.init()
	},
	onHide() {
		this.destroy()
	},
	onUnload() {
		this.destroy()
	},
	methods: {
		init() {
			const auth = getAuth()
			if (!auth || !auth.token) {
				uni.redirectTo({ url: '/pages/login/login' })
				return
			}
			this.loading = true
			// 搜索态下从聊天页返回:重新搜索拿最新结果;否则拉全量列表
			if (this.searchKeyword) {
				this.doSearch()
			} else {
				this.refresh()
			}
			// 轮询刷新未读/新会话(5s)
			this.pollTimer = setInterval(() => this.refresh(), 5000)
			// 常驻 WebSocket:新消息到达立即刷新列表(未读实时);来电弹窗;非聊天页时弹本地通知提醒
			this.ws = new ChatSocket({
				token: auth.token,
				onMsg: (data) => {
					this.refresh()
					this.notifyNewMessage(data)
				},
				onCall: (payload) => this.handleCall(payload),
				onClose: () => {},
				onError: () => {}
			})
			this.ws.connect()
		},
		/** 在会话列表页收到新消息:弹通知栏提醒(uni-push 2.0 本地通知) */
		notifyNewMessage(data) {
			if (!data || !data.senderImId) return
			// 自己发的消息不提醒
			const auth = getAuth() || {}
			if (data.senderImId === auth.userId) return
			let content = ''
			if (data.messageType === 'TEXT') {
				content = data.content || ''
			} else if (data.messageType === 'IMAGE') {
				content = '[图片]'
			} else if (data.messageType === 'AUDIO' || data.messageType === 'VOICE') {
				content = '[语音]'
			} else if (data.messageType === 'VIDEO') {
				content = '[视频]'
			} else if (data.messageType === 'FILE') {
				content = '[文件]'
			} else if (data.messageType === 'SYSTEM') {
				return // 系统消息(通话记录等)不弹通知
			} else {
				content = data.content || '[新消息]'
			}
			if (!content) return
			uni.createPushMessage({
				title: data.senderName || '新消息',
				content: content,
				payload: { type: 'chat', sessionId: data.sessionId },
				success: () => {},
				fail: () => {}
			})
		},
		/** 来电处理(弹窗确认后跳通话页;不在聊天页也能接听) */
		handleCall(payload) {
			if (!payload || payload.type !== 'call' || payload.action !== 'invite') return
			const auth = getAuth() || {}
			const isVideo = payload.callType === 'video'
			uni.showModal({
				title: '顾客来电',
				content: isVideo ? '视频通话邀请' : '语音通话邀请',
				confirmText: '接听',
				cancelText: '拒绝',
				success: (res) => {
					if (res.confirm) {
						uni.navigateTo({
							url: '/pages/call/call?sessionId=' + (payload.sessionId || '')
								+ '&peerId=' + encodeURIComponent(payload.from || '')
								+ '&token=' + encodeURIComponent(auth.token || '')
								+ '&name=' + encodeURIComponent(payload.senderName || '')
								+ '&type=' + (payload.callType || 'audio') + '&mode=incoming&auto=1'
						})
					} else {
						if (this.ws) this.ws.send({ type: 'call', action: 'reject', to: payload.from, sessionId: payload.sessionId })
					}
				}
			})
		},
		destroy() {
			if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null }
			if (this.searchTimer) { clearTimeout(this.searchTimer); this.searchTimer = null }
			if (this.ws) { this.ws.close(); this.ws = null }
		},
		async refresh() {
			// 搜索状态下不覆盖搜索结果(轮询/WS 新消息也走这里)
			if (this.searching) return
			try {
				const list = await mySessionListApi()
				this.sessions = list || []
				// 汇总未读总数(列表已按最后消息时间倒序,最新未读会话 = 第一个未读项)
				this.totalUnread = (list || []).reduce((n, s) => n + (Number(s.unreadCount) || 0), 0)
				if (this.totalUnread === 0) this.scrollIntoId = ''
			} catch (e) {
				console.log('会话列表刷新失败', e.message)
			} finally {
				this.loading = false
			}
		},
		/** 搜索框输入:防抖 350ms 后触发 */
		onSearchInput(e) {
			this.searchKeyword = (e.detail && e.detail.value) || ''
			clearTimeout(this.searchTimer)
			this.searchTimer = setTimeout(() => this.doSearch(), 350)
		},
		/** 执行搜索;关键词清空时恢复完整会话列表 */
		async doSearch() {
			clearTimeout(this.searchTimer)
			const kw = (this.searchKeyword || '').trim()
			this.searching = kw !== ''
			if (!this.searching) {
				this.refresh()
				return
			}
			const seq = ++this.searchSeq
			try {
				const list = await searchSessionsApi(kw)
				if (seq !== this.searchSeq) return // 丢弃过期响应(输入已变化)
				this.sessions = list || []
			} catch (e) {
				console.log('会话搜索失败', e.message)
				if (seq !== this.searchSeq) return
				uni.showToast({ title: '搜索失败,请重试', icon: 'none' })
			} finally {
				this.loading = false
			}
		},
		/** 清空搜索词,恢复列表 */
		clearSearch() {
			this.searchKeyword = ''
			clearTimeout(this.searchTimer)
			this.doSearch()
		},
		/** 点击底部未读条:滚动定位到最新未读会话 */
		jumpToUnread() {
			const idx = this.sessions.findIndex(s => Number(s.unreadCount) > 0)
			if (idx < 0) return
			const targetId = 'sess-' + this.sessions[idx].id
			if (this.scrollIntoId === targetId) {
				// 相同目标需先清空再赋值,保证重复点击仍会滚动
				this.scrollIntoId = ''
				this.$nextTick(() => { this.scrollIntoId = targetId })
			} else {
				this.scrollIntoId = targetId
			}
		},
		preview(s) {
			const t = s.lastMessageType
			if (t === 'IMAGE') return '[图片]'
			if (t === 'VIDEO') return '[视频]'
			if (t === 'AUDIO') return '[语音]'
			if (t === 'SYSTEM') return '[通话] ' + (s.lastMessageContent || '')
			if (t === 'FILE') return '[文件] ' + (s.lastMessageContent || '')
			return s.lastMessageContent || ''
		},
		fmtTime(ts) {
			if (!ts) return ''
			const d = new Date(String(ts).replace(' ', 'T'))
			const now = new Date()
			const same = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
			if (same(d, now)) {
				const h = String(d.getHours()).padStart(2, '0')
				const m = String(d.getMinutes()).padStart(2, '0')
				return h + ':' + m
			}
			const yest = new Date(now); yest.setDate(now.getDate() - 1)
			if (same(d, yest)) return '昨天'
			return (d.getMonth() + 1) + '-' + d.getDate()
		},
		openChat(s) {
			uni.navigateTo({
				url: '/pages/chat/chat?sessionId=' + s.id + '&peerId=' + encodeURIComponent(s.customerImId || '') + '&customerName=' + encodeURIComponent(s.customerName || '')
			})
		},
		async logout() {
			// 解绑推送设备(先于清登录态,接口要带 token)
			try {
				const pushId = getPushId()
				if (pushId) await unregisterDeviceApi(pushId)
			} catch (e) {
				console.log('[device] 解绑失败:', e.message)
			}
			clearAuth()
			uni.reLaunch({ url: '/pages/login/login' })
		}
	}
}
</script>

<style scoped>
.ah-page {
	height: 100vh;
	display: flex;
	flex-direction: column;
	background: #ededed;
}
.ah-header {
	flex-shrink: 0;
	z-index: 10;
	background: #f7f7f7;
	border-bottom: 1px solid #d9d9d9;
	display: flex; align-items: center; justify-content: space-between;
	padding: 14px 16px;
	/* 适配状态栏 */
	padding-top: calc(14px + var(--status-bar-height));
}
.ah-title { font-size: 17px; font-weight: 600; color: #1c1917; }
.ah-logout { font-size: 14px; color: #576b95; }
/* 顶部搜索栏 */
.ah-search {
	display: flex; align-items: center;
	background: #fff; border-radius: 8px;
	margin: 8px 12px; padding: 6px 10px;
}
.ah-search-ico { font-size: 14px; color: #b2b2b2; margin-right: 6px; }
.ah-search-input {
	flex: 1; min-width: 0;
	font-size: 14px; color: #1c1917;
	height: 22px; line-height: 22px;
}
.ah-search-ph { color: #b2b2b2; }
.ah-search-clear {
	font-size: 14px; color: #b2b2b2;
	padding: 0 2px;
}
.ah-tip {
	text-align: center; color: #999; font-size: 14px;
	padding: 60px 0;
}
.ah-list-scroll { flex: 1; min-height: 0; }
.ah-list { padding: 10px 12px; }
.ah-item {
	display: flex; align-items: center;
	background: #fff; border-radius: 10px;
	padding: 12px; margin-bottom: 10px;
}
.ah-avatar {
	width: 42px; height: 42px; border-radius: 8px;
	background: #95ec69; color: #1c1917;
	display: flex; align-items: center; justify-content: center;
	font-size: 18px; font-weight: 600;
	margin-right: 12px; flex-shrink: 0;
}
.ah-main { flex: 1; min-width: 0; }
.ah-row1 { display: flex; align-items: center; justify-content: space-between; }
.ah-name { font-size: 15px; font-weight: 600; color: #1c1917; }
.ah-time { font-size: 12px; color: #b2b2b2; }
.ah-row2 { display: flex; align-items: center; justify-content: space-between; margin-top: 4px; }
.ah-last {
	font-size: 13px; color: #999;
	overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
	flex: 1; margin-right: 8px;
}
.ah-last.ah-unread { color: #1c1917; }
.ah-badge {
	min-width: 18px; height: 18px; border-radius: 9px;
	background: #fa5151; color: #fff; font-size: 11px;
	display: flex; align-items: center; justify-content: center;
	padding: 0 5px; flex-shrink: 0;
}
/* 底部未读消息悬浮条(仿微信底部提示条) */
.ah-unread-float {
	position: fixed; left: 50%; transform: translateX(-50%);
	bottom: 24px; z-index: 20;
	display: flex; align-items: center;
	background: rgba(0, 0, 0, 0.75); color: #fff;
	border-radius: 20px; padding: 7px 14px;
	box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
}
.ah-unread-num {
	min-width: 18px; height: 18px; border-radius: 9px;
	background: #fa5151; color: #fff; font-size: 11px;
	display: flex; align-items: center; justify-content: center;
	padding: 0 5px; margin-right: 6px; font-weight: 600;
}
.ah-unread-text { font-size: 13px; }
</style>
