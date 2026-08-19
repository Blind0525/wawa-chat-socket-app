<script>
import { setPushId } from '@/utils/storage'
import jpush from '@/uni_modules/jpush-uniplugin/js_sdk/jpush.js'

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
		 * 依赖 jpush-uniplugin 插件(HBuilderX 插件市场安装);未装时静默跳过
		 */
		initPushId() {
			// #ifdef APP-PLUS
			try {
				jpush.init()
				const save = (res) => {
					const id = (res && (res.registrationId || res.registrationID)) || ''
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
			} catch (e) {
				console.log('[push] 极光初始化失败:', e)
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
