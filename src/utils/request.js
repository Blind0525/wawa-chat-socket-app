// 后端接口地址(用户确认:cpolar 隧道直连,context-path=/chat)
const BASE_URL = 'https://49134bd4.r20.cpolar.top/chat'

function getToken() {
  try {
    const auth = uni.getStorageSync('chat_auth')
    if (auth && auth.token) return auth.token
  } catch (e) { /* ignore */ }
  return ''
}

/**
 * uni.request 封装(微信风格:返回 Promise,resolve data 字段)
 * 后端返回 {code, message, data};code=200 时 resolve data,否则 reject message
 */
export function request(method, url, data) {
  return new Promise((resolve, reject) => {
    uni.request({
      url: BASE_URL + url,
      method,
      data,
      timeout: 20000,
      header: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + getToken()
      },
      success: (res) => {
        const body = res.data || {}
        if (body.code === 200) {
          resolve(body.data)
        } else {
          reject(new Error(body.message || body.msg || '请求失败'))
        }
      },
      fail: (err) => {
        reject(new Error(err.errMsg || '网络错误'))
      }
    })
  })
}

/**
 * 文件上传,返回 {url, fileName, fileSize}
 * App 端用 plus.uploader(原生 API,超时可配;uni.uploadFile 的 timeout 在 App 端无效,固定 20s)
 */
export function uploadFile(filePath, name) {
  // #ifdef APP-PLUS
  return new Promise((resolve, reject) => {
    try {
      const uploader = plus.uploader.createUpload(BASE_URL + '/file/upload', {
        method: 'POST',
        timeout: 180000,
        retries: 0
      }, (upload, status) => {
        if (status === 200) {
          try {
            const body = JSON.parse(upload.responseText)
            if (body.code === 200) {
              resolve(body.data)
            } else {
              reject(new Error(body.message || '上传失败'))
            }
          } catch (e) {
            reject(new Error('上传响应解析失败'))
          }
        } else {
          reject(new Error('上传失败(状态码 ' + status + ')'))
        }
      })
      uploader.addFile(filePath, { key: 'file' })
      uploader.setRequestHeader('Authorization', 'Bearer ' + getToken())
      uploader.start()
    } catch (e) {
      reject(new Error('上传启动失败: ' + (e.message || e)))
    }
  })
  // #endif
  // #ifndef APP-PLUS
  return new Promise((resolve, reject) => {
    uni.uploadFile({
      url: BASE_URL + '/file/upload',
      filePath,
      name: 'file',
      timeout: 120000,
      header: {
        'Authorization': 'Bearer ' + getToken()
      },
      success: (res) => {
        try {
          const body = JSON.parse(res.data)
          if (body.code === 200) {
            resolve(body.data)
          } else {
            reject(new Error(body.message || '上传失败'))
          }
        } catch (e) {
          reject(new Error('上传响应解析失败'))
        }
      },
      fail: (err) => {
        reject(new Error(err.errMsg || '上传失败'))
      }
    })
  })
  // #endif
}
