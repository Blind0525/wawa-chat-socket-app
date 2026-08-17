<template>
	<view class="al-page">
		<view class="al-card">
			<view class="al-logo">客服工作台</view>
			<view class="al-sub">账号登录</view>
			<input class="al-input" v-model="username" placeholder="账号" placeholder-class="al-ph" />
			<input class="al-input" v-model="password" type="password" placeholder="密码" placeholder-class="al-ph" @confirm="doLogin" />
			<button class="al-btn" :disabled="loading" @click="doLogin">{{ loading ? '登录中...' : '登 录' }}</button>
			<view v-if="errorText" class="al-error">{{ errorText }}</view>
		</view>
	</view>
</template>

<script>
import { loginApi, registerDeviceApi } from '@/api/index'
import { setAuth, getPushId } from '@/utils/storage'

export default {
	data() {
		return {
			username: '',
			password: '',
			loading: false,
			errorText: ''
		}
	},
	onLoad() {
		// 已登录直接进工作台
		const auth = uni.getStorageSync('chat_auth')
		if (auth && auth.token) {
			uni.redirectTo({ url: '/pages/home/home' })
		}
	},
	methods: {
		async doLogin() {
			if (!this.username.trim() || !this.password) {
				this.errorText = '请输入账号和密码'
				return
			}
			this.loading = true
			this.errorText = ''
			try {
				const data = await loginApi({ username: this.username.trim(), password: this.password })
				if (!data || !data.token) {
					this.errorText = '登录失败'
					return
				}
				setAuth({ token: data.token, userId: data.userId, name: data.name, userType: data.userType })
				// 极光设备上报(未装插件时 pushId 为空,自动跳过)
				this.reportDevice()
				uni.redirectTo({ url: '/pages/home/home' })
			} catch (e) {
				this.errorText = e.message || '登录失败'
			} finally {
				this.loading = false
			}
		},
		async reportDevice() {
			try {
				const pushId = getPushId()
				if (!pushId) return
				const platform = uni.getSystemInfoSync().platform || 'android'
				await registerDeviceApi({ deviceToken: pushId, platform })
				console.log('[device] 推送设备上报成功:', platform, pushId)
			} catch (e) {
				console.log('[device] 推送设备上报失败:', e.message)
			}
		}
	}
}
</script>

<style scoped>
.al-page {
	position: fixed; inset: 0;
	background: #ededed;
	display: flex; align-items: center; justify-content: center;
	padding: 24px;
}
.al-card {
	width: 100%; max-width: 340px;
	background: #fff; border-radius: 14px;
	padding: 36px 24px 28px;
	display: flex; flex-direction: column;
	box-shadow: 0 6px 24px rgba(0,0,0,0.08);
}
.al-logo {
	text-align: center; font-size: 22px; font-weight: 700; color: #1c1917;
}
.al-sub {
	text-align: center; font-size: 13px; color: #999; margin: 6px 0 26px;
}
.al-input {
	height: 46px; border: 1px solid #d9d9d9; border-radius: 8px;
	padding: 0 14px; font-size: 15px; margin-bottom: 14px;
}
.al-ph { color: #b2b2b2; }
.al-btn {
	height: 46px; line-height: 46px; border-radius: 8px;
	background: #07c160; color: #fff; font-size: 16px; font-weight: 600;
	margin-top: 6px;
}
.al-btn::after { border: none; }
.al-btn[disabled] { opacity: 0.6; color: #fff; }
.al-error {
	margin-top: 14px; text-align: center;
	font-size: 13px; color: #e54d42;
}
</style>
