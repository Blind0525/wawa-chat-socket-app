# wawa-chat-socket-app

客服工作台 iOS/Android App —— uni-app 壳工程,内嵌客服端 H5(https://wecom.offgkc.com/socket2/login),极光推送。

## 结构

    src/pages/index/index.vue   壳主页:web-view 内嵌客服端 H5,登录 URL 自动带上 pushId(极光 registrationId)与 platform
    src/App.vue                 App 生命周期(预留)
    src/manifest.json           App 配置:名称/权限(摄像头、麦克风、录音)/iOS 隐私描述
    src/pages.json              页面路由(全屏 custom 导航,web-view 铺满)

## 推送链路

1. App 启动 -> 极光插件初始化,拿到 registrationId
2. web-view 加载 https://wecom.offgkc.com/socket2/login?pushId=xxx&platform=android
3. 客服端 H5 登录成功后调 POST /chat/device/register {deviceToken: pushId, platform} 上报
4. 后端在客服 ws 离线时调极光 REST API 推送(badge 由后端计算),客服读完全部消息自动 badge=0

## 打包步骤

1. 用 HBuilderX 打开本目录(文件 -> 导入 -> 从本地目录导入)
2. manifest.json -> 基础配置:点「重新获取」生成 appid
3. 插件市场搜索「极光推送」安装 uni_modules 版插件,并在 manifest -> App 模块配置 勾选推送模块
4. manifest -> App 常用其他设置 填极光 appkey
5. 云打包:发行 -> 原生App-云打包
   - Android:直接出 apk(无需账号)
   - iOS:需要 Apple 开发者账号 + 证书/描述文件(99 美元/年)
6. 极光控制台配好 appKey/masterSecret 后填到后端 application.yml 的 jpush 段并 enabled: true

## 备注

- iOS 的 APNs 证书在极光控制台「推送设置」上传(.p8 推荐,方式见 README 讨论)
- 安卓 web-view 为系统 Chromium 内核,WebRTC 视频通话比微信 X5 干净,本地预览黑屏问题大概率不会出现
- 客服端 H5 部署在 /socket2/ 路径,App 内 web-view 直接加载线上地址,客服端 H5 更新即时生效,无需重新打包
