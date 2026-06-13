const API_BASE = "http://127.0.0.1:5000/api";

// ========== 分页&搜索全局状态 ==========
let currentKeyword = "";   // 当前搜索关键词，空=默认浏览模式
let currentPage = 1;       // 当前页码
const PAGE_SIZE = 5;       // 每页固定展示5条数据

function closeModal() {
    const modal = document.getElementById("modal");
    const graphDom = document.getElementById("modalGraph");
    echarts.dispose(graphDom);
    modal.style.display = "none";
}

// 统一数据请求&渲染核心方法（默认浏览 / 关键词搜索 共用）
async function fetchData(page = 1, keyword = "") {
    const resDom = document.getElementById("results");
    const nextBtn = document.getElementById("next-page-btn");
    const statusTip = document.getElementById("status-tip");

    // 加载中禁用分页按钮
    if (nextBtn) {
        nextBtn.disabled = true;
        nextBtn.classList.add("disabled");
    }

    try {
        // 拼接带分页、关键词的请求地址
        let url = `${API_BASE}/search?page=${page}&page_size=${PAGE_SIZE}`;
        if (keyword) {
            url += `&keyword=${encodeURIComponent(keyword)}`;
        }

        const res = await fetch(url);
        const json = await res.json();
        let html = "";

        if (json.data.length === 0) {
            html = '<div class="empty-tip">未查询到相关数据</div>';
        } else {
            json.data.forEach(item => {
                let stepsHtml = "";
                item.steps.forEach((step, idx) => {
                    stepsHtml += `<div class="step-item step-${idx+1}">推理第 ${idx + 1} 步：${step[0]} → ${step[1]} → ${step[2]}</div>`;
                });
                const safeId = item.id.replace(/'/g, "\\'");
                html += `
                <div class="result-card">
                    <div class="q-title">问题：${item.question}</div>
                    <div class="tag-group">
                        <span class="tag">类型：${item.type}</span>
                        <span class="tag">数据集：${item.split}</span>
                    </div>
                    ${stepsHtml}
                    <div class="answer">最终答案：${item.answer}</div>
                    <button class="view-btn" onclick="loadReasonChain('${safeId}')">查看本条多跳推理可视化</button>
                </div>
                `;
            });
        }
        resDom.innerHTML = html;

        // 更新顶部状态提示
        if (statusTip) {
            if (keyword) {
                statusTip.innerText = `当前：关键词「${keyword}」搜索结果（第 ${page} 页）`;
            } else {
                statusTip.innerText = `当前：浏览示例数据（第 ${page} 页）`;
            }
        }

        // 数据不足5条 → 已是最后一页，禁用下一页
        if (nextBtn) {
            if (json.data.length < PAGE_SIZE) {
                nextBtn.disabled = true;
                nextBtn.classList.add("disabled");
            } else {
                nextBtn.disabled = false;
                nextBtn.classList.remove("disabled");
            }
        }
    } catch (err) {
        resDom.innerHTML = '<div class="empty-tip">接口请求失败，请检查后端服务</div>';
        if (nextBtn) {
            nextBtn.disabled = true;
            nextBtn.classList.add("disabled");
        }
        console.error("数据加载异常：", err);
    }
}

// 关键词搜索按钮事件
async function searchQA() {
    const keyword = document.getElementById("keyword").value.trim();
    currentKeyword = keyword;
    currentPage = 1; // 搜索后重置为第一页
    await fetchData(currentPage, currentKeyword);
}

// 下一页按钮事件
async function nextPage() {
    currentPage += 1;
    await fetchData(currentPage, currentKeyword);
}

async function loadReasonChain(docId) {
    const modal = document.getElementById("modal");
    const chartDom = document.getElementById("modalGraph");
    modal.style.display = "flex";
    chartDom.innerHTML = '<div class="empty-tip">正在加载推理链路...</div>';
    try {
        const url = `${API_BASE}/chain/detail?id=${encodeURIComponent(docId)}`;
        const res = await fetch(url);
        const json = await res.json();
        if (!json || !json.data || json.data.length === 0) {
            chartDom.innerHTML = '<div class="empty-tip">未获取到推理数据</div>';
            return;
        }
        const chain = json.data[0].reason_chain;
        if (!chain || chain.length === 0) {
            chartDom.innerHTML = '<div class="empty-tip">该条数据无推理步骤</div>';
            return;
        }

        // 安全销毁旧实例
        const oldChart = echarts.getInstanceByDom(chartDom);
        if (oldChart) {
            echarts.dispose(oldChart);
        }

        const nodes = new Map();
        const links = [];
        const linkColors = ['#409EFF', '#27AE60', '#F39C12', '#E74C3C', '#8E44AD'];

        chain.forEach((item, index) => {
            const [sub, pred, obj] = item;
            if (!nodes.has(sub)) nodes.set(sub, { name: sub });
            if (!nodes.has(obj)) nodes.set(obj, { name: obj });

            links.push({
                source: sub,
                target: obj,
                // 边标签要显示的文字存在这里
                name: `第${index + 1}跳: ${pred}`,
                lineStyle: {
                    color: linkColors[index % linkColors.length],
                    width: 6,
                    curveness: 0.3
                }
            });
        });

        const chart = echarts.init(chartDom);
        chart.setOption({
            title: {
                text: `问题：${json.data[0].question}`,
                left: "center",
                textStyle: { fontSize: 16 }
            },
            tooltip: {
                textStyle: { fontSize: 14 }
            },
            series: [{
                type: "graph",
                layout: "force",
                force: { repulsion: 300, edgeLength: 150 }, // 拉长节点间距，避免文字重叠
                roam: true,
                label: {
                    show: true,
                    fontSize: 16,
                    color: '#000000' // 节点文字改为纯黑
                },
                // 关键：边标签配置，在链路中间显示文字
                edgeLabel: {
                    show: true,
                    fontSize: 12,
                    color: '#333', // 链路文字用深灰色，不刺眼
                    formatter: function(params) {
                        return params.data.name;
                    },
                    position: 'middle' // 文字显示在链路中间
                },
                edgeSymbol: ['none', 'arrow'],
                edgeSymbolSize: [0, 16], // 箭头大小
                nodes: Array.from(nodes.values()),
                links: links,
                lineStyle: {
                    curveness: 0.3,
                    width: 4 // 链路宽度，和links里的配置保持一致
                }
            }]
        });
    } catch (e) {
        chartDom.innerHTML = `<div class="empty-tip">加载出错：${e.message}</div>`;
        console.error("推理链路加载失败", e);
    }
}

async function initTypeClusterChart() {
    try {
        const res = await fetch(`${API_BASE}/cluster/type`);
        const json = await res.json();
        const chart = echarts.init(document.getElementById("typeChart"));
        chart.setOption({
            title: { text: "聚类：问题类型分布", left: "center" },
            tooltip: { trigger: "item" },
            legend: { orient: "vertical", left: "left" },
            series: [{
                name: "类型",
                type: "pie",
                radius: "70%",
                data: json.data.map(d => ({ name: d.type, value: d.count }))
            }]
        });
    } catch (err) {
        console.error("类型聚类图表加载失败", err);
    }
}

async function initStepClusterChart() {
    try {
        const res = await fetch(`${API_BASE}/cluster/steps`);
        const json = await res.json();
        const chart = echarts.init(document.getElementById("stepChart"));
        chart.setOption({
            title: { text: "聚类：推理步数分布", left: "center" },
            xAxis: {
                type: "category",
                name: "推理步数",
                data: json.data.map(d => d.steps)
            },
            yAxis: { type: "value", name: "数据条数" },
            tooltip: { trigger: "axis" },
            series: [{
                name: "数量",
                type: "bar",
                data: json.data.map(d => d.count),
                color: "#165DFF"
            }]
        });
    } catch (err) {
        console.error("步数聚类图表加载失败", err);
    }
}

async function initGlobalGraph() {
    try {
        const res = await fetch(`${API_BASE}/graph/sample?limit=20`);
        const json = await res.json();
        const nodes = new Map();
        const links = [];
        json.data.forEach(d => {
            if (!nodes.has(d.subject)) nodes.set(d.subject, { name: d.subject });
            if (!nodes.has(d.object)) nodes.set(d.object, { name: d.object });
            links.push({
                source: d.subject,
                target: d.object,
                name: d.predicate,
                lineStyle: {
                    color: '#165DFF'
                }
            });
        });
        const chart = echarts.init(document.getElementById("graph"));
        chart.setOption({
            title: { text: "全局知识图谱样本", left: "center" },
            tooltip: {},
            series: [{
                type: "graph",
                layout: "force",
                force: { repulsion: 200, edgeLength: 80 },
                roam: true,
                label: {
                    show: true,
                    fontSize: 14
                },
                edgeSymbol: ['none', 'arrow'],
                edgeSymbolSize: [0, 7],
                nodes: Array.from(nodes.values()),
                links: links,
                lineStyle: {
                    curveness: 0.3,
                    width: 1.5
                }
            }]
        });
    } catch (err) {
        console.error("全局图谱加载失败", err);
    }
}



// ========== 新增：演示实体配置（和页面热门标签保持一致） ==========
const demoEntityList = ["French", "American", "director", "actor", "actress", "1950"];
let currentDemoIndex = 0;

// 页面加载完成 → 自动加载默认演示图谱
window.addEventListener('DOMContentLoaded', function () {
    loadRandomDemoEntity();
});

// 【换一个】按钮触发函数
function loadRandomDemoEntity() {
    // 循环切换实体
    currentDemoIndex = (currentDemoIndex + 1) % demoEntityList.length;
    const targetEntity = demoEntityList[currentDemoIndex];

    // 自动填充输入框、固定为 1跳 / 最多50条
    document.getElementById("clusterEntity").value = targetEntity;
    document.getElementById("clusterDepth").value = "1";
    document.getElementById("clusterLimit").value = "50";

    // 调用查询图谱，标记为演示数据
    showEntityCluster(true);
}

// ========== 改造后的查询图谱函数（新增 isDemo 参数） ==========
async function showEntityCluster(isDemo = false) {
    const entityInput = document.getElementById("clusterEntity");
    const depthSelect = document.getElementById("clusterDepth");
    const limitSelect = document.getElementById("clusterLimit");
    const graphDom = document.getElementById("clusterGraph");
    const entity = entityInput.value.trim();
    const depth = parseInt(depthSelect.value);
    const limit = parseInt(limitSelect.value);

    if (!entity) {
        alert("请输入实体名称");
        return;
    }

    if (!graphDom) {
        console.error("图谱容器不存在");
        return;
    }

    graphDom.innerHTML = '<div class="empty-tip">正在加载关联子图...</div>';

    try {
        const url = `${API_BASE}/cluster/entity?entity=${encodeURIComponent(entity)}&depth=${depth}&limit=${limit}`;
        const res = await fetch(url);
        const json = await res.json();

        if (!json.data || json.data.length === 0) {
            graphDom.innerHTML = `<div class="empty-tip">未找到与实体「${entity}」相关的子图数据</div>`;
            return;
        }

        const oldChart = echarts.getInstanceByDom(graphDom);
        if (oldChart) {
            try {
                oldChart.dispose();
            } catch (disposeErr) {
                console.warn("旧实例销毁失败，忽略错误：", disposeErr);
            }
        }

        const nodeList = [];
        const linkList = [];
        const nameToIndex = new Map();

        // 两套配色：演示数据 / 用户手动搜索数据
        const demoLineColors = ['#409EFF', '#27AE60', '#F39C12', '#E74C3C', '#8E44AD'];
        const userLineColors = ['#FF6B6B', '#4ECDC4', '#FFA07A', '#6A5ACD', '#FFD700'];
        const colorPool = isDemo ? demoLineColors : userLineColors;

        json.data.forEach((triple, idx) => {
            const { subject, predicate, object } = triple;
            if (!subject || !object) return;

            if (!nameToIndex.has(subject)) {
                nameToIndex.set(subject, nodeList.length);
                nodeList.push({ name: subject });
            }
            if (!nameToIndex.has(object)) {
                nameToIndex.set(object, nodeList.length);
                nodeList.push({ name: object });
            }

            linkList.push({
                source: nameToIndex.get(subject),
                target: nameToIndex.get(object),
                name: predicate,
                // 根据类型切换颜色
                lineStyle: { color: colorPool[idx % colorPool.length] }
            });
        });

        if (nodeList.length === 0) {
            graphDom.innerHTML = `<div class="empty-tip">有效节点数量为0，无法渲染图谱</div>`;
            return;
        }

        const chart = echarts.init(graphDom);
        chart.setOption({
            title: {
                text: `围绕「${entity}」的${depth}跳关联子图（显示前${json.data.length}条）`,
                left: "center",
                textStyle: { fontSize: 16 }
            },
            tooltip: {},
            series: [{
                type: "graph",
                layout: "force",
                force: { repulsion: 300, edgeLength: 120 },
                roam: true,
                label: { show: true, fontSize: 14 },
                edgeSymbol: ['none', 'arrow'],
                edgeSymbolSize: [0, 8],
                nodes: nodeList,
                links: linkList,
                lineStyle: { curveness: 0.2, width: 2 }
            }]
        });

    } catch (e) {
        if (graphDom) {
            graphDom.innerHTML = `<div class="empty-tip">加载失败：${e.message}</div>`;
        }
        console.error("实体聚类加载失败：", e);
    }
}

// ========== 原搜索实体函数 完全原样保留，未做任何修改 ==========
async function searchEntity() {
    const keywordInput = document.getElementById("entitySearchKeyword");
    const resultDiv = document.getElementById("entitySearchResult");
    const keyword = keywordInput.value.trim();
    if (!keyword) {
        alert("请输入关键词");
        return;
    }
    resultDiv.innerHTML = '<div class="empty-tip">正在搜索...</div>';
    try {
        const url = `${API_BASE}/entity/search?keyword=${encodeURIComponent(keyword)}&limit=50`;
        const res = await fetch(url);
        const json = await res.json();
        if (json.data.length === 0) {
            resultDiv.innerHTML = `<div class="empty-tip">未找到包含「${keyword}」的实体</div>`;
            return;
        }
        let html = `<p>找到 ${json.count} 个实体：</p><ul>`;
        json.data.forEach(entity => {
            html += `<li>${entity}</li>`;
        });
        html += `</ul>`;
        resultDiv.innerHTML = html;
    } catch (e) {
       resultDiv.innerHTML = `<div class="empty-tip">搜索失败：${e.message}</div>`;
    }
}

// 页面加载完成统一入口
window.addEventListener('load', async function () {
    // 1. 基础图表初始化
    try {
        initTypeClusterChart();
        initStepClusterChart();
        initGlobalGraph();
    } catch (err) {
        console.error("基础图表初始化失败", err);
    }

    // 2. 统计类图表
    try {
        let res = await fetch(`${API_BASE}/stat/total_count`);
        let json = await res.json();
        if(document.getElementById('totalCountText')){
            document.getElementById('totalCountText').innerText = `数据集总条数：${json.data}`;
        }
    } catch (err) {
        if(document.getElementById('totalCountText')){
            document.getElementById('totalCountText').innerText = "数据集总条数：加载失败";
        }
        console.error("总数据量加载失败", err);
    }

    try {
        let res = await fetch(`${API_BASE}/stat/question_length`);
        let json = await res.json();
        let chartDom = document.getElementById('qLenChart');
        if (chartDom) {
            let chart = echarts.init(chartDom);
            chart.setOption({
                title: { text: "问题单词数分布", left: 'center' },
                tooltip: { trigger: 'axis' },
                xAxis: { type: 'category', data: json.data.map(d => d.range) },
                yAxis: { type: 'value' },
                series: [{ type: 'bar', data: json.data.map(d => d.count), color: "#165DFF" }]
            });
        }
    } catch (err) {
        console.error("问题长度图表加载失败", err);
    }

    try {
        let res = await fetch(`${API_BASE}/stat/question_word`);
        let json = await res.json();
        let chartDom = document.getElementById('qWordChart');
        if (chartDom) {
            let chart = echarts.init(chartDom);
            chart.setOption({
                title: { text: "英文疑问词分布", left: 'center' },
                tooltip: { trigger: 'item' },
                series: [{ type: 'pie', radius: '70%', data: json.data.map(d => ({ name: d.word, value: d.count })) }]
            });
        }
    } catch (err) {
        console.error("疑问词图表加载失败", err);
    }

    try {
        let res = await fetch(`${API_BASE}/stat/word_freq`);
        let json = await res.json();
        let chartDom = document.getElementById('wordFreqChart');
        if (chartDom) {
            let chart = echarts.init(chartDom);
            chart.setOption({
                title: { text: "高频词汇 TOP20", left: 'center' },
                tooltip: { trigger: 'axis' },
                xAxis: { type: 'category', data: json.data.map(d => d.word), axisLabel: { rotate: 45 } },
                yAxis: { type: 'value' },
                series: [{ type: 'bar', data: json.data.map(d => d.count), color: "#27AE60" }]
            });
        }
    } catch (err) {
        console.error("高频词图表加载失败", err);
    }

    try {
        let res = await fetch(`${API_BASE}/stat/predicate_dist`);
        let json = await res.json();
        let chartDom = document.getElementById('predicateChart');
        if (chartDom) {
            let chart = echarts.init(chartDom);
            chart.setOption({
                title: { text: "语义关系谓词分布", left: 'center' },
                tooltip: { trigger: 'item' },
                series: [{ type: 'pie', radius: '70%', data: json.data.map(d => ({ name: d.predicate, value: d.count })) }]
            });
        }
    } catch (err) {
        console.error("谓词分布图表加载失败", err);
    }

    try {
        let res = await fetch(`${API_BASE}/stat/entity_degree`);
        let json = await res.json();
        let chartDom = document.getElementById('entityDegreeChart');
        if (chartDom) {
            let chart = echarts.init(chartDom);
            chart.setOption({
                title: { text: "实体连接度分布", left: 'center' },
                tooltip: { trigger: 'axis' },
                xAxis: { type: 'category', data: json.data.map(d => d.range) },
                yAxis: { type: 'value' },
                series: [{ type: 'bar', data: json.data.map(d => d.count), color: "#F39C12" }]
            });
        }
    } catch (err) {
        console.error("实体连接度图表加载失败", err);
    }

    try {
        let res = await fetch(`${API_BASE}/stat/entity_top`);
        let json = await res.json();
        let chartDom = document.getElementById('entityTopChart');
        if (chartDom) {
            let chart = echarts.init(chartDom);
            chart.setOption({
                title: { text: "高频实体 TOP20", left: 'center' },
                tooltip: { trigger: 'axis' },
                xAxis: { type: 'category', data: json.data.map(d => d.entity), axisLabel: { rotate: 45 } },
                yAxis: { type: 'value' },
                series: [{ type: 'bar', data: json.data.map(d => d.count), color: "#E74C3C" }]
            });
        }
    } catch (err) {
        console.error("高频实体图表加载失败", err);
    }

    // 3. 搜索页：页面默认加载第一页5条示例数据
    await fetchData(currentPage, currentKeyword);
});
