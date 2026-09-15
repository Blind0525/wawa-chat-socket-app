'use strict';
// 云函数:sendPush  —— uni-push 2.0 服务端推送(Java 后端经云函数URL化调用)
// 部署:HBuilderX 右键本文件夹 -> 上传部署 -> uniCloud web 控制台开通"云函数URL化"
// 注意:必须用 uniCloud.getPushManager({appId});require('uni-cloud-push') 只会拿到 init
const SECRET = 'wawa_chat_2026';          // 与后端 application.yml unipush.cloud-secret 一致
const APPID = '__UNI__1B7696D';           // DCloud 应用 AppID

exports.main = async (event, context) => {
	const { secret, cid, title, content, sessionId, badge } = event || {};
	if (secret !== SECRET) {
		return { code: 403, msg: 'secret invalid' };
	}
	if (!cid) {
		return { code: 400, msg: '参数缺失: cid 必填' };
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
	} catch (e) {
		return { code: 500, msg: e && e.message ? e.message : String(e) };
	}
};
