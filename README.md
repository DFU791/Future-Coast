# Future Coast | 未来海岸线

Interactive sea-level rise visualization for China's coast.

全球变暖，海平面上升，你住的地方会被淹没吗？
受今年中国多地台风尤其上海城市积水现象启发，我用Codex做了这个中国沿海受淹没风险的网页。
预测均基于真实DEM地理高度、NASA全球海平面预测数据。
拖动时间滑块，你可以观察不同情景下中国沿海被淹没地区情况，以及城市受淹没面积、比例和排名的变化。

建议使用电脑端查看网页：[点击这里在线体验](https://future-coast.pages.dev) 
<img width="1261" height="663" alt="image" src="https://github.com/user-attachments/assets/44adf715-9f30-414f-a75e-8533edd5d217" />


## 可以体验什么

- 四种全球变暖情景，以及2025至2200年的时间轴。
- 全国沿海地势分布，随水位上升显示潜在受影响范围。
- 城市影响列表：按比例排序，支持滚动和选中跟踪。
- 鼠标滚轮缩放、拖动地图，以及缩放后显示省份名称。
- 附带独立地形页 `terrain.html`，在线加载高程瓦片。

## 本地运行

安装Node.js和npm后，在本目录运行：

```sh
npm ci
npm run dev
```

打开终端显示的本地地址。运行网页不需要下载原始DEM，也不需要配置OpenTopography密钥。地形页需要网络访问在线瓦片。

```sh
npm run build
npm run preview
```

构建结果位于 `dist/`，可部署到静态网站托管平台。不要直接双击HTML文件代替本地服务。

## 实现思路

预处理阶段将DEM高程数据转换为海洋连通阈值：对每个位置计算海水能够到达所需的水位，编码为纹理。浏览器根据当前水位绘制受影响区域，无需每次拖动滑块都重新扫描原始高程数据。

城市列表读取预计算面积曲线。部分小城市使用更细的高程网格和面积校准。视觉层包含低地逐渐显现等显示处理，因此不应将每个蓝色像素等同于独立物理统计值。

## 目录

| 目录 | 用途 |
| --- | --- |
| `src/components` | 地图、城市列表、时间轴与操作说明 |
| `src/utils/createFloodWaterLayer.ts` | 淹没纹理绘制 |
| `src/data/terrain` | 全国纹理索引与城市影响曲线 |
| `src/terrain` | 独立地形页 |
| `public/flood/national` | 15张预处理阈值纹理 |
| `scripts/terrain` | 核心高程处理与城市统计脚本 |
| `data` | 计算配置、行政边界与部分城市结果 |

技术栈：React、TypeScript、Vite、MapLibre GL、Motion；离线数据处理使用Python。

## 数据与适用范围

这是面向交互展示和风险认知的个人项目，不是工程级洪水预测。高程误差、边界精度、海平面基准和防护设施会影响结果；模型没有完整模拟海堤、防潮闸、泵站、排水、潮汐与风暴潮。厘米级变化的显示尤其不能解释为同等精度的现实预测。

原始DEM、密钥、缓存和开发历史不包含在本发布目录。数据来源及重算要求见 [DATA_SOURCES.md](DATA_SOURCES.md)。

项目通过AI辅助开发迭代完成，涵盖需求拆解、视觉设计、数据处理、交互实现与部署。
