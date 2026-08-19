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
		 * 依赖极光原生插件(插件市场 jpush-uniplugin / JG-JPush-uni,云打包自定义基座);
		 * 未装插件时静默跳过,不影响使用
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
				console.log('[push] 极光插件不可用:', e)
			}
			// #endif
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
