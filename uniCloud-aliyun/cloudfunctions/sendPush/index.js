'use strict';
// 云函数:sendPush —— uni-push 2.0 服务端推送(Java 后端经云函数URL化调用)
// 依赖:package.json 的 extensions 声明 uni-cloud-push(或在 HBuilderX 右键"管理公共模块或扩展库依赖"勾选)
// 入参:URL化后 event = { path, httpMethod, headers, queryStringParameters, body },body 为 JSON 字符串
const SECRET = 'wawa_chat_2026';
const APPID = '__UNI__1B7696D';

exports.main = async (event, context) => {
	let e = Object.assign({}, event || {});
	if (e.body !== undefined) {
		try {
			const parsed = typeof e.body === 'string' ? JSON.parse(e.body) : e.body;
			e = Object.assign(e, parsed);
		} catch (err) { /* body 不是 JSON,忽略 */ }
	}
	const { secret, cid, title, content, sessionId, badge } = e;
	if (secret !== SECRET) {
		return { code: 403, msg: 'secret invalid' };
	}
	if (!cid) {
		return { code: 400, msg: 'param missing: cid' };
	}
	try {
		const uniPush = uniCloud.getPushManager({ appId: APPID });
		const hasNotify = !!(title || content);
		const res = await uniPush.sendMessage({
			push_clientid: cid,
			title: title || '',
			content: content || '',
			payload: { type: 'chat', sessionId: String(sessionId || '') },
			force_notification: hasNotify,
			badge: badge || 0
		});
		return { code: 0, data: res };
	} catch (err) {
		return { code: 500, msg: err && err.message ? err.message : String(err) };
	}
};
