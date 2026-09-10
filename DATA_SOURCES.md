# 数据来源与计算范围

本文依据项目现有代码与元数据整理。来源名称不等于已经完成再分发许可核验。

| 数据 | 项目内记录的来源 | 用途与边界 |
| --- | --- | --- |
| 原始高程 | Copernicus GLO-30 / COP30，通过OpenTopography下载 | 未附原始文件；全国处理网格为每度280像素，不能将全国显示宣称为30米分辨率 |
| 城市行政边界 | Alibaba Cloud DataV GeoAtlas areas_v3 | 参与城市面积统计；边界可能包含海域，需要陆地筛选 |
| 中国及世界底图 | `src/data/china-geo.json`、`world-land.json` | 本发布整理未确认这两个文件的完整上游来源与许可，需补齐溯源 |
| 海平面情景 | `src/data/seaLevelScenarios.ts`，其中引用IPCC AR6 | 应用内情景与插值用于展示，不代表逐城工程预测或直接调用NASA预测服务 |
| 地形页 | Mapterhorn在线高程瓦片 | 网络按需加载，服务可用性与使用条件取决于提供方 |
| 小城市面积 | 城市配置中记录的统计或土地部门来源名称 | 年份及来源名称随配置保存；本次未逐条重新核验官方数值 |

## 已包含与未包含

发布目录附带全国阈值纹理、城市曲线、边界配置及核心处理脚本，足以运行网页和查看算法。原始高程和中间分析文件需另行准备。已生成数据的运行不依赖下载密钥。

## 重新计算

Python脚本依赖 `numpy`、`Pillow`、`scipy`。建议在独立Python环境中安装：

```sh
pip install numpy Pillow scipy
```

上述依赖未锁定版本，本次没有重新运行全国高程处理流程。

1. 依据 `data/terrain/coastTiles.json` 准备COP30高程。下载脚本使用开发者自己的OpenTopography凭据；本地密钥文件必须保持忽略。
2. `prepare_national_dem.py` 整理原始高程与分析网格。
3. `build_national_flood_textures.py` 构建海洋连通阈值与全国纹理。
4. `build_high_resolution_city_stats.py` 生成单城细化结果，`build_city_impact_stats.py` 汇总城市曲线。
5. `repair_special_boundary_masks.py` 排除地图辅助边线造成的纹理伪影。

运行前阅读各脚本参数与路径要求；这不是一个无需原始输入即可复现全流程的数据包。源码保留了公开服务地址与读取凭据的逻辑，没有附带私人API密钥。
