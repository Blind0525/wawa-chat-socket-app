<script>
import { setPushId } from '@/utils/storage'
// jg-jpush-u UTS 插件:按官方 demo 从插件名导入(Android appkey 走 manifestPlaceholders.json,iOS 走 initPush)
import { init, initPush, setDebug, getRegistrationId, setEventCallBack } from '@/uni_modules/jg-jpush-u'

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
		 * Android:init() 无参(appkey 从 nativeResources/android/manifestPlaceholders.json 读取)
		 * iOS:initPush({appkey...})
		 */
		initPushId() {
			// #ifdef APP-PLUS
			try {
				setDebug(true)
				const platform = uni.getSystemInfoSync().platform
				if (platform === 'ios') {
					initPush({
						appkey: JPUSH_APP_KEY,
						channel: 'developer-default',
						isProduction: false,
						advertisingId: ''
					})
				} else {
					init()
				}

				// 事件回调(连接状态、通知点击等)
				try {
					setEventCallBack({
						callback: (event) => {
							console.log('[push] event:', event && event.eventName, event && event.eventData)
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
					const rid = getRegistrationId()
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
