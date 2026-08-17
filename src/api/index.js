import { request, uploadFile } from '@/utils/request'

/** 客服/管理员账号登录: {username, password} -> {token, userId, name, userType} */
export function loginApi(data) {
  return request('POST', '/auth/login', data)
}

/** 客服自己的会话列表(带顾客信息/最后消息/未读数) */
export function mySessionListApi() {
  return request('GET', '/session/myList')
}

/** 分页拉取会话历史消息 {sessionId, page:{page,size}} */
export function getMessagesApi(data) {
  return request('POST', '/message/getMessagesBySession', data)
}

/** 标记会话已读 */
export function markReadApi(sessionId) {
  return request('POST', '/message/read', { id: sessionId })
}

/** 上传聊天文件(图片/视频/文件/语音),返回 {url, fileName, fileSize} */
export function uploadChatFile(filePath) {
  return uploadFile(filePath, 'file')
}

/** 上报设备 token(极光 registrationId) */
export function registerDeviceApi(data) {
  return request('POST', '/device/register', data)
}
