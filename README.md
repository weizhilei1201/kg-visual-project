# kg-visual-project
# 多跳问答与知识图谱可视化系统

基于知识图谱的多跳问答可视化系统，支持问题检索、推理链路展示、数据统计分析和实体关联图谱。

## 功能特性

- **问题多跳推理可视化** - 检索问题并展示多跳推理路径的图谱
- **数据大屏展示** - 统计图表展示数据集特征（问题类型分布、推理步数分布、高频词汇、实体连接度等）
- **实体检索与聚类** - 搜索实体名称，展示 N 跳关联子图
- **全局知识图谱查看** - 查看知识图谱样本

## 技术栈

- 前端：HTML5 + CSS3 + JavaScript + ECharts
- 数据存储：JSON 文件（纯静态，无需后端服务）
- 部署：GitHub Pages

## 项目结构
web/
├── data.json # 数据集（需自行从 ArangoDB 导出）
├── index.html # 首页导航
├── main.js # 核心逻辑（数据加载、图表渲染）
├── style.css # 全局样式
├── page_search.html # 问题多跳可视化页面
├── page_statistics.html # 数据大屏页面
├── page_subgraph.html # 实体检索与聚类页面
├── page_graph.html # 全局知识图谱页面
└── page_cluster.html # 聚类统计页面

text

## 快速开始

### 1. 导出数据

如果你已有 ArangoDB 数据库，运行以下脚本导出数据：

```bash
python export_data.py
脚本会将数据导出为 web/data.json。

2. 本地预览
在项目根目录启动一个简单的 HTTP 服务器：

bash
# Python 3
python -m http.server 8080 --directory web

# 或使用 npx
npx serve web
然后访问 http://localhost:8080

3. 部署到 GitHub Pages
将 web 文件夹下的所有文件推送到 GitHub 仓库：

bash
git add web/
git commit -m "Deploy static version"
git push origin main
在仓库 Settings -> Pages 中：

Source 选择 Deploy from a branch

Branch 选择 main，文件夹选择 /web

部署成功后访问：https://你的用户名.github.io/仓库名/

数据格式说明
data.json 中的每条数据格式如下：

json
{
  "_key": "唯一标识",
  "question": "问题文本",
  "answer": "答案文本",
  "type": "问题类型",
  "split": "数据集划分",
  "evidences": [
    ["实体1", "关系", "实体2"],
    ["实体2", "关系", "实体3"]
  ]
}
页面功能
页面	功能
问题多跳可视化	关键词检索问题，点击查看推理链路图谱
数据大屏	展示问题类型分布、推理步数分布、高频词汇等统计图表
实体检索与聚类	搜索实体名称，查看 1-2 跳关联子图
全局知识图谱	展示知识图谱样本
注意事项
本项目为纯静态版本，所有数据来自 data.json，无需后端服务

数据大屏的统计图表均从前端实时计算，无需预计算缓存

建议使用现代浏览器（Chrome、Edge、Firefox）获得最佳体验

相关链接
ECharts 官方文档

GitHub Pages 部署指南
