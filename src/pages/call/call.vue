<template>
	<view class="call-page">
		<!-- 通话页:web-view 加载线上通话 H5(复用生产验证的 CallView,含全部 WebRTC/信令/UI) -->
		<web-view :src="callUrl"></web-view>
		<!-- 返回按钮(cover-view 才能覆盖 web-view 原生组件) -->
		<cover-view class="call-back" @click="goBack">‹ 返回</cover-view>
	</view>
</template>

<script>
// 通话 H5(客服端 H5 同域部署的独立通话页)
const CALL_H5_BASE = 'https://wecom.offgkc.com/socket2/call'

/**
 * 通话页(web-view 方案)
 * 复用线上通话 H5(CallView):原生 WebRTC + ws 信令 + 完整通话 UI
 * 参数:sessionId peerId token name type(video|audio) mode(outgoing|incoming) auto(1=来电自动接听)
 */
export default {
	data() {
		return {
			callUrl: CALL_H5_BASE
		}
	},
	onLoad(options) {
		this.preRequestPermissions()
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
	},
	methods: {
		preRequestPermissions() {
			// #ifdef APP-PLUS
			try {
				plus.android.requestPermissions(
					['android.permission.RECORD_AUDIO', 'android.permission.CAMERA'],
					(res) => {
						console.log('[call] 权限申请结果:', JSON.stringify(res))
					},
					(err) => {
						console.log('[call] 权限申请失败:', JSON.stringify(err))
					}
				)
			} catch (e) {
				console.log('[call] 权限申请异常:', e)
			}
			// #endif
		},
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
