// ==================== 纯静态版本 ====================
// 直接从本地 data.json 读取数据，无需后端 API

var FULL_DATA = null;
var currentKeyword = "";
var currentPage = 1;
var PAGE_SIZE = 5;

// ==================== 通用：加载本地数据 ====================
async function loadData() {
    if (FULL_DATA) return FULL_DATA;
    try {
        var response = await fetch('data.json');
        FULL_DATA = await response.json();
        console.log("数据加载完成，共 " + FULL_DATA.length + " 条");
        return FULL_DATA;
    } catch (err) {
        console.error('加载 data.json 失败:', err);
        return [];
    }
}

// ==================== 页面：问题多跳可视化 ====================
async function fetchData(page, keyword) {
    if (page === undefined) page = 1;
    if (keyword === undefined) keyword = "";
    
    var data = await loadData();
    var resDom = document.getElementById("results");
    var nextBtn = document.getElementById("next-page-btn");
    var statusTip = document.getElementById("status-tip");

    var filtered = data;
    if (keyword) {
        filtered = data.filter(function(item) {
            return item.question && item.question.toLowerCase().includes(keyword.toLowerCase());
        });
    }

    var start = (page - 1) * PAGE_SIZE;
    var pagedData = filtered.slice(start, start + PAGE_SIZE);

    var html = "";
    if (pagedData.length === 0) {
        html = '<div class="empty-tip">未查询到相关数据</div>';
    } else {
        for (var i = 0; i < pagedData.length; i++) {
            var item = pagedData[i];
            var stepsHtml = "";
            var steps = item.evidences || [];
            for (var j = 0; j < steps.length; j++) {
                var step = steps[j];
                var stepText = "";
                if (Array.isArray(step)) {
                    stepText = step[0] + " -> " + step[1] + " -> " + step[2];
                } else {
                    stepText = JSON.stringify(step);
                }
                stepsHtml += '<div class="step-item step-' + (j+1) + '">推理第 ' + (j+1) + ' 步：' + stepText + '</div>';
            }
            var safeId = (item._key || item.original_id || '').replace(/'/g, "\\'");
            html += `
            <div class="result-card">
                <div class="q-title">问题：` + (item.question || '无问题') + `</div>
                <div class="tag-group">
                    <span class="tag">类型：` + (item.type || '未知') + `</span>
                    <span class="tag">数据集：` + (item.split || 'unknown') + `</span>
                </div>
                ` + stepsHtml + `
                <div class="answer">最终答案：` + (item.answer || '无答案') + `</div>
                <button class="view-btn" onclick="loadReasonChain('` + safeId + `')">查看本条多跳推理可视化</button>
            </div>`;
        }
    }
    resDom.innerHTML = html;

    if (statusTip) {
        if (keyword) {
            statusTip.innerText = "当前：关键词[" + keyword + "]搜索结果（第 " + page + " 页）";
        } else {
            statusTip.innerText = "当前：浏览示例数据（第 " + page + " 页）";
        }
    }

    if (nextBtn) {
        var hasMore = start + PAGE_SIZE < filtered.length;
        nextBtn.disabled = !hasMore;
        if (hasMore) {
            nextBtn.classList.remove("disabled");
        } else {
            nextBtn.classList.add("disabled");
        }
    }
}

async function searchQA() {
    var keyword = document.getElementById("keyword").value.trim();
    currentKeyword = keyword;
    currentPage = 1;
    await fetchData(currentPage, currentKeyword);
}

async function nextPage() {
    currentPage += 1;
    await fetchData(currentPage, currentKeyword);
}

// ==================== 推理链路可视化（弹窗） ====================
async function loadReasonChain(docId) {
    var data = await loadData();
    var item = null;
    for (var i = 0; i < data.length; i++) {
        if (data[i]._key === docId || data[i].original_id === docId) {
            item = data[i];
            break;
        }
    }
    
    var modal = document.getElementById("modal");
    var chartDom = document.getElementById("modalGraph");
    modal.style.display = "flex";
    
    if (!item || !item.evidences || item.evidences.length === 0) {
        chartDom.innerHTML = '<div class="empty-tip">该条数据无推理步骤</div>';
        return;
    }

    var chain = item.evidences;
    chartDom.innerHTML = '<div class="empty-tip">正在渲染推理链路...</div>';

    var oldChart = echarts.getInstanceByDom(chartDom);
    if (oldChart) echarts.dispose(oldChart);

    var nodes = new Map();
    var links = [];
    var linkColors = ['#409EFF', '#27AE60', '#F39C12', '#E74C3C', '#8E44AD'];

    for (var j = 0; j < chain.length; j++) {
        var step = chain[j];
        var sub, pred, obj;
        if (Array.isArray(step)) {
            sub = step[0];
            pred = step[1];
            obj = step[2];
        } else {
            sub = step.subject || step[0];
            pred = step.predicate || step[1];
            obj = step.object || step[2];
        }
        if (!sub || !obj) continue;
        
        if (!nodes.has(sub)) nodes.set(sub, { name: sub });
        if (!nodes.has(obj)) nodes.set(obj, { name: obj });
        links.push({
            source: sub,
            target: obj,
            name: "第" + (j+1) + "跳: " + pred,
            lineStyle: { color: linkColors[j % linkColors.length], width: 6, curveness: 0.3 }
        });
    }

    var chart = echarts.init(chartDom);
    chart.setOption({
        title: { text: "问题：" + (item.question || '无问题'), left: "center", textStyle: { fontSize: 16 } },
        tooltip: { textStyle: { fontSize: 14 } },
        series: [{
            type: "graph",
            layout: "force",
            force: { repulsion: 300, edgeLength: 150 },
            roam: true,
            label: { show: true, fontSize: 16, color: '#000000' },
            edgeLabel: { show: true, fontSize: 12, color: '#333', formatter: function(p) { return p.data.name; }, position: 'middle' },
            edgeSymbol: ['none', 'arrow'],
            edgeSymbolSize: [0, 16],
            nodes: Array.from(nodes.values()),
            links: links,
            lineStyle: { curveness: 0.3, width: 4 }
        }]
    });
}

function closeModal() {
    var modal = document.getElementById("modal");
    var graphDom = document.getElementById("modalGraph");
    var oldChart = echarts.getInstanceByDom(graphDom);
    if (oldChart) echarts.dispose(oldChart);
    modal.style.display = "none";
}

// ==================== 聚类统计 ====================
async function initTypeClusterChart() {
    var data = await loadData();
    var typeCount = new Map();
    for (var i = 0; i < data.length; i++) {
        var t = data[i].type || 'unknown';
        typeCount.set(t, (typeCount.get(t) || 0) + 1);
    }
    var chartData = [];
    for (var [name, value] of typeCount.entries()) {
        chartData.push({ name: name, value: value });
    }
    var chart = echarts.init(document.getElementById("typeChart"));
    chart.setOption({
        title: { text: "聚类：问题类型分布", left: "center" },
        tooltip: { trigger: "item" },
        legend: { orient: "vertical", left: "left" },
        series: [{ name: "类型", type: "pie", radius: "70%", data: chartData }]
    });
}

async function initStepClusterChart() {
    var data = await loadData();
    var stepCount = new Map();
    for (var i = 0; i < data.length; i++) {
        var steps = data[i].evidences || [];
        var len = steps.length;
        stepCount.set(len, (stepCount.get(len) || 0) + 1);
    }
    var chartData = [];
    for (var [steps, count] of stepCount.entries()) {
        chartData.push({ steps: steps, count: count });
    }
    chartData.sort(function(a, b) { return a.steps - b.steps; });
    var chart = echarts.init(document.getElementById("stepChart"));
    chart.setOption({
        title: { text: "聚类：推理步数分布", left: "center" },
        xAxis: { type: "category", name: "推理步数", data: chartData.map(function(d) { return d.steps; }) },
        yAxis: { type: "value", name: "数据条数" },
        tooltip: { trigger: "axis" },
        series: [{ name: "数量", type: "bar", data: chartData.map(function(d) { return d.count; }), color: "#165DFF" }]
    });
}

// ==================== 全局知识图谱 ====================
async function initGlobalGraph() {
    var data = await loadData();
    var nodes = new Map();
    var links = [];
    var linkColors = ['#409EFF', '#27AE60', '#F39C12', '#E74C3C', '#8E44AD'];
    var colorIdx = 0;
    
    for (var i = 0; i < data.length; i++) {
        var steps = data[i].evidences || [];
        for (var j = 0; j < steps.length; j++) {
            var step = steps[j];
            if (!Array.isArray(step) || step.length < 3) continue;
            var sub = step[0];
            var pred = step[1];
            var obj = step[2];
            if (!sub || !obj) continue;
            if (!nodes.has(sub)) nodes.set(sub, { name: sub });
            if (!nodes.has(obj)) nodes.set(obj, { name: obj });
            links.push({
                source: sub,
                target: obj,
                name: pred,
                lineStyle: { color: linkColors[colorIdx % linkColors.length] }
            });
            colorIdx++;
        }
    }
    
    var chart = echarts.init(document.getElementById("graph"));
    chart.setOption({
        title: { text: "全局知识图谱样本", left: "center" },
        tooltip: {},
        series: [{
            type: "graph",
            layout: "force",
            force: { repulsion: 200, edgeLength: 80 },
            roam: true,
            label: { show: true, fontSize: 14 },
            edgeSymbol: ['none', 'arrow'],
            edgeSymbolSize: [0, 7],
            nodes: Array.from(nodes.values()),
            links: links,
            lineStyle: { curveness: 0.3, width: 1.5 }
        }]
    });
}

// ==================== 实体检索与聚类页面 ====================
var demoEntityList = ["French", "American", "director", "actor", "actress", "1950"];
var currentDemoIndex = 0;

function loadRandomDemoEntity() {
    currentDemoIndex = (currentDemoIndex + 1) % demoEntityList.length;
    var targetEntity = demoEntityList[currentDemoIndex];
    document.getElementById("clusterEntity").value = targetEntity;
    document.getElementById("clusterDepth").value = "1";
    document.getElementById("clusterLimit").value = "50";
    showEntityCluster(false);
}

async function showEntityCluster(isDemo) {
    var entityInput = document.getElementById("clusterEntity");
    var depthSelect = document.getElementById("clusterDepth");
    var limitSelect = document.getElementById("clusterLimit");
    var graphDom = document.getElementById("clusterGraph");
    var entity = entityInput.value.trim();
    var depth = parseInt(depthSelect.value);
    var limit = parseInt(limitSelect.value);

    if (!entity) {
        alert("请输入实体名称");
        return;
    }

    if (!graphDom) {
        console.error("图谱容器不存在");
        return;
    }

    graphDom.innerHTML = '<div class="empty-tip">正在加载关联子图...</div>';

    var data = await loadData();
    var allTriples = [];
    
    for (var i = 0; i < data.length; i++) {
        var steps = data[i].evidences || [];
        for (var j = 0; j < steps.length; j++) {
            var s = steps[j];
            if (Array.isArray(s) && s.length >= 3) {
                allTriples.push({ subject: s[0], predicate: s[1], object: s[2] });
            }
        }
    }

    var matchedTriples = [];
    for (var i = 0; i < allTriples.length; i++) {
        var t = allTriples[i];
        if (entity === t.subject || entity === t.object) {
            matchedTriples.push(t);
        }
    }

    if (depth === 2) {
        var relatedEntities = new Set();
        for (var i = 0; i < matchedTriples.length; i++) {
            var t = matchedTriples[i];
            if (t.subject !== entity) relatedEntities.add(t.subject);
            if (t.object !== entity) relatedEntities.add(t.object);
        }
        for (var i = 0; i < allTriples.length; i++) {
            var t = allTriples[i];
            if (relatedEntities.has(t.subject) || relatedEntities.has(t.object)) {
                matchedTriples.push(t);
            }
        }
    }

    var seen = new Set();
    var uniqueTriples = [];
    for (var i = 0; i < matchedTriples.length; i++) {
        var t = matchedTriples[i];
        var key = t.subject + "|" + t.predicate + "|" + t.object;
        if (!seen.has(key)) {
            seen.add(key);
            uniqueTriples.push(t);
            if (uniqueTriples.length >= limit) break;
        }
    }

    if (uniqueTriples.length === 0) {
        graphDom.innerHTML = '<div class="empty-tip">未找到与实体[' + entity + ']相关的子图数据</div>';
        return;
    }

    var oldChart = echarts.getInstanceByDom(graphDom);
    if (oldChart) {
        try { oldChart.dispose(); } catch(e) {}
    }

    var nodeList = [];
    var linkList = [];
    var nameToIndex = new Map();
    var demoLineColors = ['#409EFF', '#27AE60', '#F39C12', '#E74C3C', '#8E44AD'];

    for (var i = 0; i < uniqueTriples.length; i++) {
        var t = uniqueTriples[i];
        if (!nameToIndex.has(t.subject)) {
            nameToIndex.set(t.subject, nodeList.length);
            nodeList.push({ name: t.subject });
        }
        if (!nameToIndex.has(t.object)) {
            nameToIndex.set(t.object, nodeList.length);
            nodeList.push({ name: t.object });
        }
        linkList.push({
            source: nameToIndex.get(t.subject),
            target: nameToIndex.get(t.object),
            name: t.predicate,
            lineStyle: { color: demoLineColors[i % demoLineColors.length] }
        });
    }

    var chart = echarts.init(graphDom);
    chart.setOption({
        title: { text: "围绕[" + entity + "]的" + depth + "跳关联子图（显示前" + uniqueTriples.length + "条）", left: "center", textStyle: { fontSize: 16 } },
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
}

async function searchEntity() {
    var keywordInput = document.getElementById("entitySearchKeyword");
    var resultDiv = document.getElementById("entitySearchResult");
    var keyword = keywordInput.value.trim();
    if (!keyword) {
        alert("请输入关键词");
        return;
    }
    resultDiv.innerHTML = '<div class="empty-tip">正在搜索...</div>';
    
    var data = await loadData();
    var entities = new Set();
    
    for (var i = 0; i < data.length; i++) {
        var steps = data[i].evidences || [];
        for (var j = 0; j < steps.length; j++) {
            var s = steps[j];
            if (Array.isArray(s) && s.length >= 3) {
                if (s[0].toLowerCase().includes(keyword.toLowerCase())) entities.add(s[0]);
                if (s[2].toLowerCase().includes(keyword.toLowerCase())) entities.add(s[2]);
            }
        }
    }
    
    var entityList = Array.from(entities);
    if (entityList.length === 0) {
        resultDiv.innerHTML = '<div class="empty-tip">未找到包含[' + keyword + ']的实体</div>';
        return;
    }
    var html = '<p>找到 ' + entityList.length + ' 个实体：</p><ul>';
    for (var i = 0; i < Math.min(entityList.length, 50); i++) {
        html += '<li>' + entityList[i] + '</li>';
    }
    html += '</ul>';
    resultDiv.innerHTML = html;
}

// ==================== 数据大屏统计 ====================
async function loadStatistics() {
    var data = await loadData();
    
    // 总数据量
    var totalCountElem = document.getElementById('totalCountText');
    if (totalCountElem) {
        totalCountElem.innerText = "数据集总条数：" + data.length;
    }
    
    // 问题类型分布（已经在 initTypeClusterChart 中处理）
    // 推理步数分布（已经在 initStepClusterChart 中处理）
    
    // 问题单词数分布
    var wordCountDist = new Map();
    for (var i = 0; i < data.length; i++) {
        var q = data[i].question || "";
        var cleanQ = q.toLowerCase().replace(/[^\w\s]/g, '');
        var words = cleanQ.split(/\s+/).filter(function(w) { return w.length > 0; });
        var cnt = words.length;
        if (cnt <= 5) wordCountDist.set("1-5 words", (wordCountDist.get("1-5 words") || 0) + 1);
        else if (cnt <= 10) wordCountDist.set("6-10 words", (wordCountDist.get("6-10 words") || 0) + 1);
        else if (cnt <= 15) wordCountDist.set("11-15 words", (wordCountDist.get("11-15 words") || 0) + 1);
        else wordCountDist.set(">15 words", (wordCountDist.get(">15 words") || 0) + 1);
    }
    var qLenChart = document.getElementById('qLenChart');
    if (qLenChart) {
        var chart = echarts.init(qLenChart);
        chart.setOption({
            title: { text: "问题单词数分布", left: 'center' },
            tooltip: { trigger: 'axis' },
            xAxis: { type: 'category', data: Array.from(wordCountDist.keys()) },
            yAxis: { type: 'value' },
            series: [{ type: 'bar', data: Array.from(wordCountDist.values()), color: "#165DFF" }]
        });
    }
    
    // 疑问词分布
    var questionWords = ["what", "where", "who", "whom", "whose", "when", "why", "how", "which"];
    var qWordCount = new Map();
    for (var i = 0; i < data.length; i++) {
        var q = data[i].question || "";
        var firstWord = q.toLowerCase().split(/\s+/)[0] || "";
        if (questionWords.indexOf(firstWord) !== -1) {
            qWordCount.set(firstWord, (qWordCount.get(firstWord) || 0) + 1);
        }
    }
    var qWordChart = document.getElementById('qWordChart');
    if (qWordChart) {
        var chart = echarts.init(qWordChart);
        chart.setOption({
            title: { text: "英文疑问词分布", left: 'center' },
            tooltip: { trigger: 'item' },
            series: [{ type: 'pie', radius: '70%', data: Array.from(qWordCount.entries()).map(function(e) { return { name: e[0], value: e[1] }; }) }]
        });
    }
    
    // 高频词汇 TOP20
    var stopWords = new Set(["a","an","the","and","or","but","is","are","am","was","were","be","been","in","on","at","to","for","of","with","by","from","as","it","this","that","these","those","you","he","she","we","they","me","him","her"]);
    var allWords = [];
    for (var i = 0; i < data.length; i++) {
        var q = data[i].question || "";
        var cleanQ = q.toLowerCase().replace(/[^\w\s]/g, '');
        var words = cleanQ.split(/\s+/);
        for (var j = 0; j < words.length; j++) {
            var w = words[j];
            if (w.length > 1 && !stopWords.has(w)) allWords.push(w);
        }
    }
    var wordFreq = new Map();
    for (var i = 0; i < allWords.length; i++) {
        var w = allWords[i];
        wordFreq.set(w, (wordFreq.get(w) || 0) + 1);
    }
    var sortedWords = Array.from(wordFreq.entries()).sort(function(a, b) { return b[1] - a[1]; }).slice(0, 20);
    var wordFreqChart = document.getElementById('wordFreqChart');
    if (wordFreqChart) {
        var chart = echarts.init(wordFreqChart);
        chart.setOption({
            title: { text: "高频词汇 TOP20", left: 'center' },
            tooltip: { trigger: 'axis' },
            xAxis: { type: 'category', data: sortedWords.map(function(e) { return e[0]; }), axisLabel: { rotate: 45 } },
            yAxis: { type: 'value' },
            series: [{ type: 'bar', data: sortedWords.map(function(e) { return e[1]; }), color: "#27AE60" }]
        });
    }
    
    // 关系谓词分布
    var predCount = new Map();
    for (var i = 0; i < data.length; i++) {
        var steps = data[i].evidences || [];
        for (var j = 0; j < steps.length; j++) {
            var s = steps[j];
            if (Array.isArray(s) && s.length >= 2) {
                var pred = s[1];
                predCount.set(pred, (predCount.get(pred) || 0) + 1);
            }
        }
    }
    var sortedPred = Array.from(predCount.entries()).sort(function(a, b) { return b[1] - a[1]; }).slice(0, 20);
    var predicateChart = document.getElementById('predicateChart');
    if (predicateChart) {
        var chart = echarts.init(predicateChart);
        chart.setOption({
            title: { text: "语义关系谓词分布", left: 'center' },
            tooltip: { trigger: 'item' },
            series: [{ type: 'pie', radius: '70%', data: sortedPred.map(function(e) { return { name: e[0], value: e[1] }; }) }]
        });
    }
    
    // 实体连接度分布
    var entityDegree = new Map();
    for (var i = 0; i < data.length; i++) {
        var steps = data[i].evidences || [];
        for (var j = 0; j < steps.length; j++) {
            var s = steps[j];
            if (Array.isArray(s) && s.length >= 3) {
                entityDegree.set(s[0], (entityDegree.get(s[0]) || 0) + 1);
                entityDegree.set(s[2], (entityDegree.get(s[2]) || 0) + 1);
            }
        }
    }
    var degreeDist = new Map();
    for (var deg of entityDegree.values()) {
        if (deg === 1) degreeDist.set("1 edge", (degreeDist.get("1 edge") || 0) + 1);
        else if (deg <= 3) degreeDist.set("2-3 edges", (degreeDist.get("2-3 edges") || 0) + 1);
        else if (deg <= 5) degreeDist.set("4-5 edges", (degreeDist.get("4-5 edges") || 0) + 1);
        else degreeDist.set(">5 edges", (degreeDist.get(">5 edges") || 0) + 1);
    }
    var entityDegreeChart = document.getElementById('entityDegreeChart');
    if (entityDegreeChart) {
        var chart = echarts.init(entityDegreeChart);
        chart.setOption({
            title: { text: "实体连接度分布", left: 'center' },
            tooltip: { trigger: 'axis' },
            xAxis: { type: 'category', data: Array.from(degreeDist.keys()) },
            yAxis: { type: 'value' },
            series: [{ type: 'bar', data: Array.from(degreeDist.values()), color: "#F39C12" }]
        });
    }
    
    // 高频实体 TOP20
    var entityTop = Array.from(entityDegree.entries()).sort(function(a, b) { return b[1] - a[1]; }).slice(0, 20);
    var entityTopChart = document.getElementById('entityTopChart');
    if (entityTopChart) {
        var chart = echarts.init(entityTopChart);
        chart.setOption({
            title: { text: "高频实体 TOP20", left: 'center' },
            tooltip: { trigger: 'axis' },
            xAxis: { type: 'category', data: entityTop.map(function(e) { return e[0]; }), axisLabel: { rotate: 45 } },
            yAxis: { type: 'value' },
            series: [{ type: 'bar', data: entityTop.map(function(e) { return e[1]; }), color: "#E74C3C" }]
        });
    }
}

// ==================== 页面初始化 ====================
window.addEventListener('load', async function() {
    await loadData();
    
    // 判断当前页面，执行对应的初始化
    if (document.getElementById("typeChart") && document.getElementById("stepChart")) {
        initTypeClusterChart();
        initStepClusterChart();
    }
    
    if (document.getElementById("graph")) {
        initGlobalGraph();
    }
    
    if (document.getElementById("clusterGraph")) {
        // 实体检索与聚类页面
        loadRandomDemoEntity();
    }
    
    if (document.getElementById("totalCountText")) {
        loadStatistics();
    }
    
    if (document.getElementById("results")) {
        fetchData(1, "");
    }
});
