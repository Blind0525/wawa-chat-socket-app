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
		 * uni-push 2.0:获取推送 clientId(cid)存入本地,登录成功后上报给后端
		 * 需 manifest 勾选 Push 模块 + 云打包(或自定义基座);未配置时静默跳过
		 */
		initPushId() {
			// #ifdef APP-PLUS
			try {
				uni.getPushClientId({
					success: (res) => {
						const cid = res && res.cid
						if (cid) {
							setPushId(cid)
							console.log('[push] cid:', cid)
						} else {
							console.log('[push] 未获取到 cid')
						}
					},
					fail: (err) => {
						console.log('[push] 获取cid失败:', JSON.stringify(err))
					}
				})
			} catch (e) {
				console.log('[push] getPushClientId 异常:', e)
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
