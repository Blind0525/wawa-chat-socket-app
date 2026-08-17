<script>
import { setPushId } from '@/utils/storage'

export default {
	onLaunch: function () {
		console.log('App Launch')
		this.initPushId()
	},
	onShow: function () {
		console.log('App Show')
	},
	onHide: function () {
		console.log('App Hide')
	},
	methods: {
		/**
		 * 获取极光 registrationId 存入本地(登录成功后上报给后端)
		 * 需在 HBuilderX 中安装极光推送插件;未安装时静默跳过,不影响使用
		 */
		initPushId() {
			// #ifdef APP-PLUS
			try {
				const jpush = uni.requireNativePlugin('JG-JPush')
				if (jpush && typeof jpush.getRegistrationID === 'function') {
					jpush.getRegistrationID((res) => {
						setPushId((res && res.registrationID) || '')
					})
					return
				}
			} catch (e) {
				console.log('[push] 极光插件获取失败:', e)
			}
			// #endif
			setPushId('')
		}
	}
}
</script>

<style>
/* 全局:微信灰底 */
page {
	background: #ededed;
}
</style>
