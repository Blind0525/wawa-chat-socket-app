<script>
import { setPushId } from '@/utils/storage'
// jg-jpush-u 是 UTS 插件:直接 import 平台实现(appkey 通过 init 传入)
// #ifdef APP-ANDROID
import * as jpush from '@/uni_modules/jg-jpush-u/utssdk/app-android/index.uts'
// #endif
// #ifdef APP-IOS
import * as jpush from '@/uni_modules/jg-jpush-u/utssdk/app-ios/index.uts'
// #endif

const JPUSH_APP_KEY = '7acafe0df93bb35ad447a775'

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
		 * 初始化极光并获取 registrationId 存入本地(登录成功后上报给后端)
		 * 依赖 jg-jpush-u 插件(uni_modules,云打包时自动带上原生代码)
		 */
		initPushId() {
			// #ifdef APP-PLUS
			try {
				jpush.setDebug(true) // 调试日志;正式发布可去掉
				jpush.init(JPUSH_APP_KEY) // 传 appkey 初始化

				// 事件回调(连接状态、通知点击等,先打日志便于排查)
				try {
					jpush.setEventCallBack({
						callback: (event) => {
							console.log('[push] event:', event && event.eventName, event && event.eventData)
							// 连接成功事件:再取一次 registrationId
							if (event && event.eventName === 'connect') {
								this.tryGetRegistrationId(5)
							}
						}
					})
				} catch (e) {
					console.log('[push] setEventCallBack 失败:', e)
				}

				// 启动时轮询取 registrationId(初始化完成前返回空,最多等 20 秒)
				this.tryGetRegistrationId(10)
			} catch (e) {
				console.log('[push] 极光初始化失败:', e)
			}
			// #endif
		},
		/** 轮询取 registrationId,totalTries 次,每 2 秒一次 */
		tryGetRegistrationId(totalTries) {
			let tries = 0
			const timer = setInterval(() => {
				tries++
				try {
					const rid = jpush.getRegistrationId()
					if (rid) {
						clearInterval(timer)
						setPushId(rid)
						console.log('[push] registrationId:', rid)
					} else if (tries >= totalTries) {
						clearInterval(timer)
						console.log('[push] 未取到 registrationId(已重试', totalTries, '次)')
					}
				} catch (e) {
					clearInterval(timer)
					console.log('[push] getRegistrationId 异常:', e)
				}
			}, 2000)
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
