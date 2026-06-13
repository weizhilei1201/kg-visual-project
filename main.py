from fastapi import FastAPI, Query
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from arango import ArangoClient
import json
import string
from collections import Counter

app = FastAPI(title="多跳问答 - 接口服务")

# 挂载静态资源
app.mount("/static", StaticFiles(directory="."), name="static")

# 跨域
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 连接ArangoDB（按你本地配置修改账号密码）
client = ArangoClient(hosts="http://127.0.0.1:8529")
db = client.db("multihop_qa", username="root", password="arangodb123")

# 缓存集合
cache_col = db.collection("stat_cache")

# ===================== 页面路由（不变） =====================
@app.get("/")
def home_page():
    return FileResponse("index.html")

@app.get("/search")
def page_search():
    return FileResponse("page_search.html")

@app.get("/statistics")
def page_statistics():
    return FileResponse("page_statistics.html")

@app.get("/subgraph")
def page_subgraph():
    return FileResponse("page_subgraph.html")

@app.get("/graph")
def page_graph():
    return FileResponse("page_graph.html")

# ===================== 原有业务API（全部保留，无修改） =====================
# 1. 关键词检索
@app.get("/api/search")
def search(
    keyword: str = Query("", description="搜索关键词，为空则返回默认分页数据"),
    page: int = Query(1, ge=1, description="页码，从1开始"),
    page_size: int = Query(5, ge=1, description="每页条数，默认5条")
):
    # 计算分页偏移量
    offset = (page - 1) * page_size

    if keyword:
        # 有关键词：按关键词搜索 + 分页
        aql = f"""
        FOR q IN qa_data
            FILTER CONTAINS(q.question, @kw)
            LIMIT @offset, @page_size
            RETURN {{
                id: q._key,
                type: q.type,
                question: q.question,
                steps: q.evidences,
                answer: q.answer,
                split: q.split
            }}
        """
        bind_vars = {"kw": keyword, "offset": offset, "page_size": page_size}
    else:
        # 无关键词：直接按分页返回全库数据
        aql = f"""
        FOR q IN qa_data
            LIMIT @offset, @page_size
            RETURN {{
                id: q._key,
                type: q.type,
                question: q.question,
                steps: q.evidences,
                answer: q.answer,
                split: q.split
            }}
        """
        bind_vars = {"offset": offset, "page_size": page_size}

    cursor = db.aql.execute(aql, bind_vars=bind_vars)
    data_list = []
    for item in cursor:
        try:
            item["steps"] = json.loads(item["steps"])
        except:
            item["steps"] = []
        data_list.append(item)
    
    return {"code": 200, "data": data_list}

# 2. 问题类型聚类
@app.get("/api/cluster/type")
def cluster_by_type():
    aql = "FOR q IN qa_data COLLECT t = q.type WITH COUNT INTO cnt RETURN {type: t, count: cnt}"
    return {"code": 200, "data": list(db.aql.execute(aql))}

# 3. 推理步数聚类
@app.get("/api/cluster/steps")
def cluster_by_steps():
    aql = "FOR q IN qa_data RETURN q.evidences"
    cursor = db.aql.execute(aql)
    step_count = {}
    for doc in cursor:
        try:
            steps = json.loads(doc)
            l = len(steps)
        except:
            l = 0
        step_count[l] = step_count.get(l, 0) + 1
    res = [{"steps": k, "count": v} for k, v in step_count.items()]
    return {"code": 200, "data": res}

# 4. 单条推理链路
@app.get("/api/chain/detail")
def get_reason_chain(id: str = Query(...)):
    aql = """
    FOR q IN qa_data
        FILTER q._key == @doc_id
        RETURN {question: q.question, answer: q.answer, reason_chain: q.evidences}
    """
    cursor = db.aql.execute(aql, bind_vars={"doc_id": id})
    data_list = []
    for item in cursor:
        try:
            item["reason_chain"] = json.loads(item["reason_chain"])
        except:
            item["reason_chain"] = []
        data_list.append(item)
    return {"code": 200, "data": data_list}

# 5. 全局知识图谱样本
@app.get("/api/graph/sample")
def graph_sample(limit: int = 20):
    aql = "FOR q IN qa_data LIMIT @lim RETURN q.evidences"
    cursor = db.aql.execute(aql, bind_vars={"lim": limit})
    result = []
    for doc in cursor:
        try:
            steps = json.loads(doc)
            for s in steps:
                if len(s) >= 3:
                    result.append({"subject": s[0], "predicate": s[1], "object": s[2]})
        except:
            continue
    return {"code": 200, "data": result}

# 6. 实体关联子图
import json
from fastapi import Query

@app.get("/api/cluster/entity")
def entity_cluster(
    entity: str = Query(...), 
    depth: int = Query(1, ge=1, le=2), 
    limit: int = Query(50)
):
    aql = "FOR q IN qa_data RETURN q.evidences"
    cursor = db.aql.execute(aql)
    all_triples = []
    for doc in cursor:
        try:
            steps = json.loads(doc)
            for s in steps:
                if len(s) >= 3 and (entity == s[0] or entity == s[2]):
                    all_triples.append({"subject": s[0], "predicate": s[1], "object": s[2]})
        except:
            continue

    if depth == 1:
        seen = set()
        res = []
        for t in all_triples:
            key = (t["subject"], t["predicate"], t["object"])
            if key not in seen:
                seen.add(key)
                res.append(t)
                if len(res) >= limit:
                    break
        return {"code": 200, "data": res}

    # 处理 depth == 2 的情况
    related_entities = set()
    for t in all_triples:
        if t["subject"] != entity:
            related_entities.add(t["subject"])
        if t["object"] != entity:
            related_entities.add(t["object"])

    cursor2 = db.aql.execute(aql)
    for doc in cursor2:
        try:
            steps = json.loads(doc)
            for s in steps:
                if len(s) >= 3 and (s[0] in related_entities or s[2] in related_entities):
                    all_triples.append({"subject": s[0], "predicate": s[1], "object": s[2]})
        except:
            continue

    seen = set()
    final_data = []
    for t in all_triples:
        key = (t["subject"], t["predicate"], t["object"])
        if key not in seen:
            seen.add(key)
            final_data.append(t)
            if len(final_data) >= limit:
                break

    return {"code": 200, "data": final_data}

# 7. 实体检索
@app.get("/api/entity/search")
def search_entity(keyword: str = Query(...), limit: int = 50):
    aql = "FOR q IN qa_data RETURN q.evidences"
    cursor = db.aql.execute(aql)
    entities = set()
    for doc in cursor:
        try:
            steps = json.loads(doc)
            for s in steps:
                if len(s) >= 3:
                    if keyword.lower() in s[0].lower():
                        entities.add(s[0])
                    if keyword.lower() in s[2].lower():
                        entities.add(s[2])
        except:
            continue
    entity_list = list(entities)[:limit]
    return {"code": 200, "count": len(entities), "data": entity_list}

# ===================== 【新增】预计算全量统计 & 写入缓存接口 =====================
# 英文停用词（基础过滤）
STOP_WORDS = {
    "a","an","the","and","or","but","is","are","am","was","were","be","been",
    "in","on","at","to","for","of","with","by","from","as","it","this","that",
    "these","those","you","he","she","we","they","me","him","her"
}
# 疑问词列表
QUESTION_WORDS = ["what","where","who","whom","whose","when","why","how","which"]

@app.get("/api/stat/calc_all")
def calc_all_stat():
    """手动触发：全量计算所有统计，写入 stat_cache 缓存集合"""
    # 清空旧缓存
    cache_col.truncate()

    # 1. 总数据量
    total_aql = "RETURN COUNT(FOR q IN qa_data RETURN q)"
    total_num = list(db.aql.execute(total_aql))[0]
    cache_col.insert({"type":"total_count", "data": total_num})

    # 遍历原始数据，统一提取字段
    all_questions = []
    all_triples = []
    aql = "FOR q IN qa_data RETURN {question: q.question, evidences: q.evidences}"
    cursor = db.aql.execute(aql)
    for item in cursor:
        q_text = item.get("question", "")
        all_questions.append(q_text)
        # 解析三元组
        try:
            evi = json.loads(item.get("evidences", "[]"))
            for t in evi:
                if len(t)>=3:
                    all_triples.append(t)
        except:
            continue

    # 2. 问题单词数分布
    word_count_list = []
    for q in all_questions:
        # 去除标点、转小写、分词
        trans = str.maketrans('', '', string.punctuation)
        clean_q = q.translate(trans).lower()
        words = clean_q.split()
        word_count_list.append(len(words))
    # 按区间分组
    len_dist = Counter()
    for cnt in word_count_list:
        if cnt <=5:
            len_dist["1-5 words"] +=1
        elif cnt <=10:
            len_dist["6-10 words"] +=1
        elif cnt <=15:
            len_dist["11-15 words"] +=1
        else:
            len_dist[">15 words"] +=1
    len_data = [{"range":k, "count":v} for k,v in len_dist.items()]
    cache_col.insert({"type":"question_length", "data": len_data})

    # 3. 高频单词 + 疑问词
    all_words = []
    q_word_counter = Counter()
    for q in all_questions:
        trans = str.maketrans('', '', string.punctuation)
        clean_q = q.translate(trans).lower()
        words = clean_q.split()
        for w in words:
            if w in QUESTION_WORDS:
                q_word_counter[w] +=1
            if w not in STOP_WORDS and len(w)>1:
                all_words.append(w)
    # 通用高频词 TOP20
    word_top = Counter(all_words).most_common(20)
    word_data = [{"word":k, "count":v} for k,v in word_top]
    # 疑问词统计
    q_word_data = [{"word":k, "count":v} for k,v in q_word_counter.items()]
    cache_col.insert({"type":"word_freq", "data": word_data})
    cache_col.insert({"type":"question_word", "data": q_word_data})

    # 4. 关系谓词分布
    pred_counter = Counter()
    for t in all_triples:
        pred = t[1]
        pred_counter[pred] +=1
    pred_data = [{"predicate":k, "count":v} for k,v in pred_counter.items()]
    cache_col.insert({"type":"predicate_dist", "data": pred_data})

    # 5. 高频实体 TOP20
    entity_counter = Counter()
    for t in all_triples:
        s = t[0]
        o = t[2]
        entity_counter[s] +=1
        entity_counter[o] +=1
    entity_top = entity_counter.most_common(20)
    entity_data = [{"entity":k, "count":v} for k,v in entity_top]
    cache_col.insert({"type":"entity_top", "data": entity_data})

    # 6. 实体连接度分布
    degree_counter = Counter()
    for t in all_triples:
        s = t[0]
        o = t[2]
        degree_counter[s] +=1
        degree_counter[o] +=1
    # 按区间分组
    degree_dist = Counter()
    for d in degree_counter.values():
        if d ==1:
            degree_dist["1 edge"] +=1
        elif d <=3:
            degree_dist["2-3 edges"] +=1
        elif d <=5:
            degree_dist["4-5 edges"] +=1
        else:
            degree_dist[">5 edges"] +=1
    degree_data = [{"range":k, "count":v} for k,v in degree_dist.items()]
    cache_col.insert({"type":"entity_degree", "data": degree_data})

    return {"code":200, "msg":"全量统计计算完成，已写入缓存"}

# ===================== 【新增】缓存查询接口（前端页面调用） =====================
def get_cache_data(stat_type: str):
    aql = "FOR d IN stat_cache FILTER d.type == @t RETURN d.data"
    res = list(db.aql.execute(aql, bind_vars={"t": stat_type}))
    if not res:
        return {"code":200, "data":[]}
    return {"code":200, "data": res[0]}

# 总数据量
@app.get("/api/stat/total_count")
def api_total_count():
    return get_cache_data("total_count")

# 问题长度分布
@app.get("/api/stat/question_length")
def api_question_length():
    return get_cache_data("question_length")

# 高频单词
@app.get("/api/stat/word_freq")
def api_word_freq():
    return get_cache_data("word_freq")

# 疑问词统计
@app.get("/api/stat/question_word")
def api_question_word():
    return get_cache_data("question_word")

# 关系谓词分布
@app.get("/api/stat/predicate_dist")
def api_predicate_dist():
    return get_cache_data("predicate_dist")

# 高频实体TOP
@app.get("/api/stat/entity_top")
def api_entity_top():
    return get_cache_data("entity_top")

# 实体连接度分布
@app.get("/api/stat/entity_degree")
def api_entity_degree():
    return get_cache_data("entity_degree")

# 启动入口
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=5000, reload=True)
