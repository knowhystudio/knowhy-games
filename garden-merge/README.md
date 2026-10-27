# 花园合并

直接打开 `index.html` 即可游玩，无广告模式不加载 SDK 或访问外部资源。植物右下角的数字表示通过阳光或浇水壶增加的成长等级；浇水壶影响所选植物及上下左右相邻的植物。铲子在每次消除后有 20% 的概率补充；阳光每累计 150 分补充一个。三种道具初始各一个，上限各两个。

## 广告宿主接入

单文件默认使用空操作适配器。广告宿主可在游戏脚本执行前注入 `window.gardenAdsAdapter`，提供如下接口：

```js
window.gardenAdsAdapter = {
  enabled: true,
  interstitial: async () => { /* 展示并等待插屏关闭 */ },
  rewarded: async (tool) => { /* tool 为 shovel、sun 或 water；完整观看返回 true */ return false; }
};
```

游戏仅在终局后玩家点击再来一局时调用插屏；仅在玩家主动选择未达到上限的道具时调用激励广告。适配器抛错不会阻止重新开始，激励失败不会发放道具。SDK 的加载与实现由广告宿主负责。
