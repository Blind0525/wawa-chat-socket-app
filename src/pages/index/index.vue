<template>
	<web-view :src="webUrl"></web-view>
</template>

<script>
/**
 * 客服工作台壳页面:web-view 内嵌客服端 H5
 * 登录页会带上极光 registrationId(pushId)与平台参数,客服端 H5 登录成功后调
 * POST /chat/device/register 上报,后端即可在客服离线时推送系统级通知。
 */
export default {
	data() {
		return {
			webUrl: 'https://wecom.offgkc.com/socket2/login'
		}
	},
	onLoad() {
		this.initPushId()
	},
	onShow() {
		// 回到前台时通知 H5 刷新未读(预留:web-view 无法直接通信时靠 H5 自身 ws 重连)
	},
	methods: {
		/**
		 * 获取极光 registrationId(需在 HBuilderX 中安装极光推送插件)
		 * 插件市场搜索 "极光推送" 安装 uni_modules 版后:
		 *   方式一:uni.requireNativePlugin('JG-JPush')(原生插件,云打包自动集成)
		 *   方式二:uni_modules 版 import jpush from '@/uni_modules/jpush/js_sdk/jpush.js'
		 * 未安装插件时静默跳过,页面照常打开,只是没有推送。
		 */
		initPushId() {
			// #ifdef APP-PLUS
			try {
				const jpush = uni.requireNativePlugin('JG-JPush')
				if (jpush && typeof jpush.getRegistrationID === 'function') {
					jpush.getRegistrationID((res) => {
						const rid = (res && res.registrationID) || ''
						this.appendParams(rid)
					})
					return
				}
			} catch (e) {
				console.log('[push] 极光插件获取失败:', e)
			}
			// #endif
			this.appendParams('')
		},
		/** 把 pushId/platform 拼到 H5 登录地址 */
		appendParams(pushId) {
			const params = []
			if (pushId) params.push('pushId=' + encodeURIComponent(pushId))
			const platform = uni.getSystemInfoSync().platform // android / ios
			if (platform) params.push('platform=' + platform)
			this.webUrl = 'https://wecom.offgkc.com/socket2/login' + (params.length ? '?' + params.join('&') : '')
		}
	}
}
</script>

<style>
</style>
