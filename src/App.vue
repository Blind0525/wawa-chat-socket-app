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
		 * 需在 HBuilderX 中安装 JG-JPush 原生插件并云打包自定义基座;未安装时静默跳过
		 */
		initPushId() {
			// #ifdef APP-PLUS
			try {
				const jpush = uni.requireNativePlugin('JG-JPush')
				if (jpush) {
					const save = (res) => {
						const id = (res && (res.registrationID || res.registrationId)) || ''
						if (id) {
							setPushId(id)
							console.log('[push] registrationId:', id)
						}
					}
					// 启动时先取一次(已连接时直接有值)
					if (typeof jpush.getRegistrationID === 'function') {
						jpush.getRegistrationID(save)
					}
					// 连接成功后再取一次(首次启动未连接完时拿不到,连接上后补)
					if (typeof jpush.addConnectEventListener === 'function') {
						jpush.addConnectEventListener(() => {
							if (typeof jpush.getRegistrationID === 'function') {
								jpush.getRegistrationID(save)
							}
						})
					}
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
