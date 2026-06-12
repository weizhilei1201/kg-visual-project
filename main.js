const API_BASE = "https://sulphate-disrupt-saline.ngrok-free.dev/api";

window.onload = function () {
    initTypeClusterChart();
    initStepClusterChart();
    initGlobalGraph();
};

function closeModal() {
    const modal = document.getElementById("modal");
    const graphDom = document.getElementById("modalGraph");
    echarts.dispose(graphDom);
    modal.style.display = "none";
}

async function searchQA() {
    const keyword = document.getElementById("keyword").value.trim();
    const resDom = document.getElementById("results");

    if (!keyword) {
        resDom.innerHTML = '<div class="empty-tip">请输入检索关键词</div>';
        return;
    }

    try {
        const res = await fetch(`${API_BASE}/search?keyword=${encodeURIComponent(keyword)}`, {
  headers: { "ngrok-skip-browser-warning": "true" }
});
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
    } catch (err) {
        resDom.innerHTML = '<div class="empty-tip">接口请求失败，请检查后端服务</div>';
        console.error(err);
    }
}

async function loadReasonChain(docId) {
    const modal = document.getElementById("modal");
    const chartDom = document.getElementById("modalGraph");

    modal.style.display = "flex";
    chartDom.innerHTML = '<div class="empty-tip">正在加载推理链路...</div>';

    try {
        const url = `${API_BASE}/chain/detail?id=${encodeURIComponent(docId)}`;
        const res = await fetch(url, {
  headers: { "ngrok-skip-browser-warning": "true" }
});
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

        echarts.dispose(chartDom);

        const nodes = new Map();
        const links = [];
        // 链路颜色列表，循环使用
        const linkColors = ['#409EFF', '#27AE60', '#F39C12', '#E74C3C', '#8E44AD'];

        chain.forEach((item, index) => {
            const [sub, pred, obj] = item;
            if (!nodes.has(sub)) nodes.set(sub, { name: sub });
            if (!nodes.has(obj)) nodes.set(obj, { name: obj });
            links.push({
                source: sub,
                target: obj,
                name: `第${index + 1}跳: ${pred}`,
                lineStyle: {
                    color: linkColors[index % linkColors.length]
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
                force: { repulsion: 300, edgeLength: 120 },
                roam: true,
                label: {
                    show: true,
                    fontSize: 16 // 节点字体大小
                },
                // 链路箭头配置
                edgeSymbol: ['none', 'arrow'],
                edgeSymbolSize: [0, 9],
                nodes: Array.from(nodes.values()),
                links: links,
                lineStyle: {
                    curveness: 0.2,
                    width: 2
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
        const res = await fetch(`${API_BASE}/cluster/type`, {
  headers: { "ngrok-skip-browser-warning": "true" }
});
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
        const res = await fetch(`${API_BASE}/cluster/steps`, {
  headers: { "ngrok-skip-browser-warning": "true" }
});
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
        const res = await fetch(`${API_BASE}/graph/sample?limit=20`, {
  headers: { "ngrok-skip-browser-warning": "true" }
});
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

// 实体关联聚类：展示围绕某实体的N跳子图
async function showEntityCluster() {
    // 1. 获取 DOM 元素
    const entityInput = document.getElementById("clusterEntity");
    const depthSelect = document.getElementById("clusterDepth");
    const limitSelect = document.getElementById("clusterLimit");
    const graphDom = document.getElementById("clusterGraph");

    // 2. 读取输入值
    const entity = entityInput.value.trim();
    const depth = parseInt(depthSelect.value);
    const limit = parseInt(limitSelect.value);

    // 3. 输入校验
    if (!entity) {
        alert("请输入实体名称");
        return;
    }

    // 4. 加载状态提示
    graphDom.innerHTML = '<div class="empty-tip">正在加载关联子图...</div>';

    try {
        // 5. 发起请求（和你浏览器里能访问的地址完全一致）
        const url = `${API_BASE}/cluster/entity?entity=${encodeURIComponent(entity)}&depth=${depth}&limit=${limit}`;
        const res = await fetch(url, {
  headers: { "ngrok-skip-browser-warning": "true" }
});
        const json = await res.json();

        // 6. 处理空数据
        if (!json.data || json.data.length === 0) {
            graphDom.innerHTML = `<div class="empty-tip">未找到与实体「${entity}」相关的子图数据</div>`;
            return;
        }

        // 7. 销毁旧图表
        if (echarts.getInstanceByDom(graphDom)) {
            echarts.dispose(graphDom);
        }

        // 8. 准备图表数据
        const nodes = new Map();
        const links = [];
        const linkColors = ['#409EFF', '#27AE60', '#F39C12', '#E74C3C', '#8E44AD'];

        json.data.forEach((triple, index) => {
            const { subject, predicate, object } = triple;
            if (!nodes.has(subject)) nodes.set(subject, { name: subject });
            if (!nodes.has(object)) nodes.set(object, { name: object });
            links.push({
                source: subject,
                target: object,
                name: predicate,
                lineStyle: {
                    color: linkColors[index % linkColors.length]
                }
            });
        });

        // 9. 渲染图表
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
                nodes: Array.from(nodes.values()),
                links: links,
                lineStyle: { curveness: 0.2, width: 2 }
            }]
        });

    } catch (e) {
        // 10. 错误处理
        graphDom.innerHTML = `<div class="empty-tip">加载失败：${e.message}</div>`;
        console.error("实体聚类加载失败", e);
    }
}

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
        const res = await fetch(url, {
  headers: { "ngrok-skip-browser-warning": "true" }
});
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
