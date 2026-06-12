from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from arango import ArangoClient
import json

app = FastAPI(title="多跳问答 - 接口服务")

# 跨域配置
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 连接 ArangoDB（替换为你自己的账号密码）
client = ArangoClient(hosts="http://127.0.0.1:8529")
db = client.db("multihop_qa", username="root", password="arangodb123")

# 1. 关键词检索
@app.get("/api/search")
def search(keyword: str = Query(...)):
    aql = """
    FOR q IN qa_data
        FILTER CONTAINS(q.question, @kw)
        RETURN {
            id: q._key,
            type: q.type,
            question: q.question,
            steps: q.evidences,
            answer: q.answer,
            split: q.split
        }
    """
    cursor = db.aql.execute(aql, bind_vars={"kw": keyword})
    data_list = []
    for item in cursor:
        try:
            item["steps"] = json.loads(item["steps"])
        except:
            item["steps"] = []
        data_list.append(item)
    return {"code": 200, "data": data_list}

# 2. 按问题类型聚类
@app.get("/api/cluster/type")
def cluster_by_type():
    aql = """
    FOR q IN qa_data
        COLLECT t = q.type WITH COUNT INTO cnt
        RETURN {type: t, count: cnt}
    """
    cursor = db.aql.execute(aql)
    return {"code": 200, "data": list(cursor)}

# 3. 按推理步数聚类
@app.get("/api/cluster/steps")
def cluster_by_steps():
    aql = """
    FOR q IN qa_data
        RETURN q.evidences
    """
    cursor = db.aql.execute(aql)
    step_count = {}
    for doc in cursor:
        try:
            steps = json.loads(doc)
            l = len(steps)
        except:
            l = 0
        if l in step_count:
            step_count[l] += 1
        else:
            step_count[l] = 1
    res = [{"steps": k, "count": v} for k, v in step_count.items()]
    return {"code": 200, "data": res}

# 4. 单条推理链路详情
@app.get("/api/chain/detail")
def get_reason_chain(id: str = Query(...)):
    aql = """
    FOR q IN qa_data
        FILTER q._key == @doc_id
        RETURN {
            question: q.question,
            answer: q.answer,
            reason_chain: q.evidences
        }
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

# 5. 全局知识图谱样本（修复AQL语法 + 异常捕获）
@app.get("/api/graph/sample")
def graph_sample(limit: int = 20):
    # 标准 AQL 写法：LIMIT 放在 FOR 内部
    aql = """
    FOR q IN qa_data
        LIMIT @lim
        RETURN q.evidences
    """
    cursor = db.aql.execute(aql, bind_vars={"lim": limit})
    result = []
    for doc in cursor:
        try:
            steps = json.loads(doc)
            for s in steps:
                if len(s) >= 3:
                    result.append({
                        "subject": s[0],
                        "predicate": s[1],
                        "object": s[2]
                    })
        except:
            continue
    return {"code": 200, "data": result}


# 6. 实体关联聚类：围绕某个实体，返回关联子图（修复 AQL 错误）
@app.get("/api/cluster/entity")
def entity_cluster(
    entity: str = Query(...),
    depth: int = Query(1, ge=1, le=2),  # 只允许 1、2 跳，去掉3跳
    limit: int = Query(50, ge=1, le=200)
):
    aql = "FOR q IN qa_data RETURN q.evidences"
    cursor = db.aql.execute(aql)
    all_triples = []

    # 第一层：收集目标实体直接关联三元组
    for doc in cursor:
        try:
            steps = json.loads(doc)
            for s in steps:
                if len(s) >= 3 and (entity == s[0] or entity == s[2]):
                    all_triples.append({
                        "subject": s[0],
                        "predicate": s[1],
                        "object": s[2]
                    })
        except:
            continue

    # 1跳：去重 + 条数限制
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
        return {"code": 200, "entity": entity, "depth": depth, "limit": limit, "data": res}

    # 2跳：扩展一级关联实体（不再处理3跳）
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
                    all_triples.append({
                        "subject": s[0],
                        "predicate": s[1],
                        "object": s[2]
                    })
        except:
            continue

    # 全局去重 + 条数限制
    seen = set()
    final_data = []
    for t in all_triples:
        key = (t["subject"], t["predicate"], t["object"])
        if key not in seen:
            seen.add(key)
            final_data.append(t)
            if len(final_data) >= limit:
                break

    return {"code": 200, "entity": entity, "depth": depth, "limit": limit, "data": final_data}

# 7. 实体节点检索：查找名字包含关键词的实体
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
                    # 收集所有包含关键词的实体
                    if keyword.lower() in s[0].lower():
                        entities.add(s[0])
                    if keyword.lower() in s[2].lower():
                        entities.add(s[2])
        except:
            continue

    # 转为列表并限制数量
    entity_list = list(entities)[:limit]
    return {"code": 200, "keyword": keyword, "count": len(entity_list), "data": entity_list}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=5000, reload=True)
