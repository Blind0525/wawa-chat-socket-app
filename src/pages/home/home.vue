<template>
	<view class="ah-page">
		<view class="ah-header">
			<text class="ah-title">客服工作台</text>
			<text class="ah-logout" @click="logout">退出</text>
		</view>

		<view v-if="loading && sessions.length === 0" class="ah-tip">加载中...</view>
		<view v-else-if="sessions.length === 0" class="ah-tip">暂无会话</view>

		<view v-else class="ah-list">
			<view v-for="s in sessions" :key="s.id" class="ah-item" @click="openChat(s)">
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
	</view>
</template>

<script>
import { mySessionListApi } from '@/api/index'
import { ChatSocket } from '@/utils/ws'
import { getAuth, clearAuth } from '@/utils/storage'

export default {
	data() {
		return {
			sessions: [],
			loading: false
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
			this.refresh()
			// 轮询刷新未读/新会话(5s)
			this.pollTimer = setInterval(() => this.refresh(), 5000)
			// 常驻 WebSocket:新消息到达立即刷新列表(未读实时);来电弹窗
			this.ws = new ChatSocket({
				token: auth.token,
				onMsg: () => this.refresh(),
				onCall: (payload) => this.handleCall(payload),
				onClose: () => {},
				onError: () => {}
			})
			this.ws.connect()
		},
		/** 来电处理(直接跳通话页响铃,用户在通话页点接听,手势留在通话页) */
		handleCall(payload) {
			if (!payload || payload.type !== 'call' || payload.action !== 'invite') return
			const auth = getAuth() || {}
			uni.navigateTo({
				url: '/pages/call/call?sessionId=' + (payload.sessionId || '')
					+ '&peerId=' + encodeURIComponent(payload.from || '')
					+ '&token=' + encodeURIComponent(auth.token || '')
					+ '&name=' + encodeURIComponent(payload.senderName || '')
					+ '&type=' + (payload.callType || 'audio') + '&mode=incoming&auto=0'
			})
		},
		destroy() {
			if (this.pollTimer) { clearInterval(this.pollTimer); this.pollTimer = null }
			if (this.ws) { this.ws.close(); this.ws = null }
		},
		async refresh() {
			try {
				const list = await mySessionListApi()
				this.sessions = list || []
			} catch (e) {
				console.log('会话列表刷新失败', e.message)
			} finally {
				this.loading = false
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
		logout() {
			clearAuth()
			uni.reLaunch({ url: '/pages/login/login' })
		}
	}
}
</script>

<style scoped>
.ah-page {
	min-height: 100vh;
	background: #ededed;
	padding-bottom: 20px;
}
.ah-header {
	position: sticky; top: 0; z-index: 10;
	background: #f7f7f7;
	border-bottom: 1px solid #d9d9d9;
	display: flex; align-items: center; justify-content: space-between;
	padding: 14px 16px;
	/* 适配状态栏 */
	padding-top: calc(14px + var(--status-bar-height));
}
.ah-title { font-size: 17px; font-weight: 600; color: #1c1917; }
.ah-logout { font-size: 14px; color: #576b95; }
.ah-tip {
	text-align: center; color: #999; font-size: 14px;
	padding: 60px 0;
}
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
</style>
