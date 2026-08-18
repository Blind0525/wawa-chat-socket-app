// WebSocket 地址(与 H5 同链路:nginx ws 升级 -> cpolar 隧道 -> 后端)
const WS_URL = 'wss://wecom.offgkc.com/chat/ws'

/**
 * 自建 IM WebSocket 客户端(uni-app 版,对应 H5 版 utils/ws.js)
 * 服务端 -> 客户端消息:
 *   {type:'pong'}                      心跳应答
 *   {type:'msg', data:{...落库消息}}    对方发来的聊天消息
 *   {type:'ack', localId, data:{...}}  自己消息的回执(带库 id / 真实文件 url)
 *   {type:'call', action, from, to,...} 通话信令
 *   {type:'error', message}
 */
export class ChatSocket {
  constructor({ token, onMsg, onCall, onAck, onError, onClose, onConnected }) {
    this.token = token
    this.onMsg = onMsg || (() => {})
    this.onCall = onCall || (() => {})
    this.onAck = onAck || (() => {})
    this.onError = onError || (() => {})
    this.onClose = onClose || (() => {})
    this.onConnected = onConnected || (() => {})
    this.task = null
    this.manualClose = false
    this.heartbeatTimer = null
    this.reconnectTimer = null
    this.attempts = 0
  }

  connect() {
    this.manualClose = false
    try {
      this.task = uni.connectSocket({
        url: WS_URL + '?token=' + encodeURIComponent(this.token),
        complete: () => { /* ignore */ }
      })
    } catch (e) {
      this.scheduleReconnect()
      return
    }

    this.task.onOpen(() => {
      this.attempts = 0
      this.onConnected()
      this.startHeartbeat()
    })

    this.task.onMessage((res) => {
      let obj = null
      try { obj = JSON.parse(res.data) } catch (err) { return }
      if (!obj || !obj.type) return
      switch (obj.type) {
        case 'pong':
          break
        case 'msg':
          this.onMsg(obj.data)
          break
        case 'ack':
          this.onAck(obj.localId, obj.data)
          break
        case 'call':
          this.onCall(obj)
          break
        case 'error':
          this.onError(obj.message || '未知错误')
          break
      }
    })

    this.task.onClose(() => {
      this.stopHeartbeat()
      this.onClose()
      if (!this.manualClose) this.scheduleReconnect()
    })

    this.task.onError(() => { /* onClose 会随之触发 */ })
  }

  send(obj) {
    if (this.task) {
      try {
        this.task.send({ data: JSON.stringify(obj) })
      } catch (e) { /* ignore */ }
    }
  }

  startHeartbeat() {
    this.stopHeartbeat()
    this.heartbeatTimer = setInterval(() => {
      if (this.task) {
        try { this.task.send({ data: JSON.stringify({ type: 'ping' }) }) } catch (e) { /* ignore */ }
      }
    }, 25000)
  }

  stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }

  scheduleReconnect() {
    if (this.reconnectTimer) return
    this.attempts++
    if (this.attempts > 20) return // 最多重试 20 次后放弃
    const delay = Math.min(30000, 3000 * this.attempts)
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.connect()
    }, delay)
  }

  close() {
    this.manualClose = true
    this.stopHeartbeat()
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.task) {
      try { this.task.close({}) } catch (e) { /* ignore */ }
      this.task = null
    }
  }
}
