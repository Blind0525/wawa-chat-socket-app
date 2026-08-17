<template>
	<view class="call-page">
		<!-- WebRTC 引擎(renderjs 自治:信令/媒体/UI 全在渲染层) -->
		<call-engine :cfg="cfg" />
		<!-- 返回按钮(常驻,renderjs 通话界面下方,任何时候可退出) -->
		<view class="back-btn" @click="goBack">‹ 返回</view>
	</view>
</template>

<script>
import CallEngine from '@/components/call-engine.vue'

/**
 * 通话页(renderjs 完全自治版)
 * 逻辑层只做:解析 URL 参数传给引擎组件 + 提供返回按钮
 * 信令/WebRTC/UI 渲染全部由组件内 renderjs 自己完成(自己连 ws、自己渲染界面)
 * URL 参数:sessionId peerId token name type(video|audio) mode(outgoing|incoming)
 */
export default {
	components: { CallEngine },
	data() {
		return {
			cfg: ''
		}
	},
	onLoad(options) {
		// 权限预申请(renderjs 的 getUserMedia 需要系统麦克风/摄像头权限)
		this.preRequestPermissions()
		// 参数传给引擎(JSON 字符串,经 data-cfg 供 renderjs 读取)
		this.cfg = JSON.stringify({
			sessionId: options.sessionId || '',
			peerId: options.peerId || '',
			token: options.token || '',
			name: options.name || '',
			type: options.type || 'video',
			mode: options.mode || 'outgoing'
		})
	},
	onUnload() {
		// renderjs 的 ws/媒体随 webview 销毁自动清理
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
.back-btn {
	position: fixed;
	top: calc(20px + var(--status-bar-height));
	left: 12px;
	z-index: 50;
	width: 64px; height: 32px;
	line-height: 32px;
	border-radius: 16px;
	background: rgba(0,0,0,0.45);
	color: #fff;
	font-size: 14px;
	text-align: center;
}
</style>
