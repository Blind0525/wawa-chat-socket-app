<template>
	<view class="call-page">
		<!-- 通话页:web-view 加载独立通话 H5(方案C兜底,WebRTC 需浏览器环境) -->
		<web-view :src="callUrl"></web-view>
		<!-- 返回按钮(cover-view 才能覆盖 web-view 原生组件) -->
		<cover-view class="call-back" @click="goBack">‹ 返回</cover-view>
	</view>
</template>

<script>
// 通话 H5 地址(客服端 H5 同域部署的独立通话页)
const CALL_H5_BASE = 'https://wecom.offgkc.com/socket2/call'

export default {
	data() {
		return {
			callUrl: CALL_H5_BASE
		}
	},
	onLoad(options) {
		const params = []
		const map = {
			sessionId: options.sessionId,
			peerId: options.peerId,
			token: options.token,
			name: options.name,
			type: options.type || 'video',
			mode: options.mode || 'outgoing',
			auto: options.auto || '0'
		}
		Object.keys(map).forEach(k => {
			if (map[k]) params.push(k + '=' + encodeURIComponent(map[k]))
		})
		this.callUrl = CALL_H5_BASE + '?' + params.join('&')
		console.log('[call] 通话页加载:', this.callUrl)
	},
	methods: {
		goBack() {
			uni.navigateBack()
		}
	}
}
</script>

<style scoped>
.call-page {
	position: fixed; inset: 0;
	background: #000;
}
.call-back {
	position: fixed;
	top: calc(20px + var(--status-bar-height));
	left: 12px;
	z-index: 9999;
	width: 64px; height: 32px;
	line-height: 32px;
	border-radius: 16px;
	background: rgba(0,0,0,0.45);
	color: #fff;
	font-size: 14px;
	text-align: center;
}
</style>
