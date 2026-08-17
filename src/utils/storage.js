// 本地缓存封装(登录信息 + 极光 pushId)

const TOKEN_KEY = 'chat_auth'
const PUSH_ID_KEY = 'chat_push_id'

export function getAuth() {
  try {
    return uni.getStorageSync(TOKEN_KEY) || null
  } catch (e) {
    return null
  }
}

export function setAuth(auth) {
  uni.setStorageSync(TOKEN_KEY, auth)
}

export function clearAuth() {
  try { uni.removeStorageSync(TOKEN_KEY) } catch (e) { /* ignore */ }
}

export function getPushId() {
  try {
    return uni.getStorageSync(PUSH_ID_KEY) || ''
  } catch (e) {
    return ''
  }
}

export function setPushId(id) {
  uni.setStorageSync(PUSH_ID_KEY, id || '')
}
