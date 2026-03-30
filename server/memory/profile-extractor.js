/**
 * 画像自动提取器（Profile Extractor）
 * 
 * 原理：每次对话后，用 LLM 判断用户消息中是否包含值得记住的个人信息
 * 如果有，自动结构化提取并存入 meta JSON
 * 
 * 与 signal-detector 的区别：
 *   signal-detector = 正则匹配，快但覆盖有限（<1ms，零成本）
 *   profile-extractor = LLM 分析，慢但覆盖全面（~2s，消耗 token）
 * 
 * 策略：signal-detector 先做快筛，没命中时才交给 profile-extractor
 * 这样既省 token 又不漏信息
 */
const db = require('../data/database');

// LLM 提取 prompt — 告诉 AI 该提取什么
const EXTRACTION_PROMPT = `你是一个用户画像提取器。分析用户说的话，判断是否包含值得长期记住的个人信息。

只提取以下类别的信息（如果有的话）：
- birthday: 生日（格式 MM-DD）
- age: 年龄
- city: 所在城市
- gender: 性别
- play_time: 常玩时段（如 "晚上10点后"）
- fav_mode: 喜欢的游戏模式（如 "排位赛"、"爆破"）
- fav_map: 喜欢的地图
- fav_weapon: 喜欢的武器
- real_name: 真名/昵称
- occupation: 职业/身份（如 "学生"、"上班族"）
- hobby: 游戏外的爱好
- goal: 游戏目标（如 "冲枪王"）
- custom: 其他值得记住的信息（自定义 key）

规则：
1. 只提取用户**主动透露**的信息，不要猜测
2. 如果消息中没有任何个人信息，返回空 JSON: {}
3. 返回纯 JSON，不要加任何其他文字
4. 如果是更新已有信息（如换了城市），返回新值
5. custom 字段的 key 用英文下划线命名，value 用中文

示例：
用户: "我生日是4月28号"
输出: {"birthday":"04-28"}

用户: "我是个大学生，晚上10点后才有空打游戏"
输出: {"occupation":"大学生","play_time":"晚上10点后"}

用户: "今天天气怎么样"
输出: {}

用户: "我最喜欢打爆破模式，沙漠灰是我的主场"
输出: {"fav_mode":"爆破","fav_map":"沙漠灰"}`;

/**
 * 分析用户消息，提取画像信息
 * @param {string} userText - 用户消息
 * @param {function} llmCall - LLM 调用函数（注入依赖，避免循环引用）
 * @returns {object|null} 提取到的字段，如 { birthday: "04-28", city: "广州" }
 */
async function extractProfile(userText, llmCall) {
  if (!userText || userText.length < 4) return null;

  // 快速过滤：纯功能性请求不太可能包含个人信息
  const skipPatterns = [
    /^(查|看|帮|告诉|分析|推荐|设置|删除|取消)/,
    /^(今天|明天|这周|最近).*(天气|任务|武器|战绩)/,
    /^\S{1,2}$/,  // 太短的消息
  ];
  if (skipPatterns.some(p => p.test(userText.trim()))) return null;

  try {
    const response = await llmCall({
      messages: [
        { role: 'system', content: EXTRACTION_PROMPT },
        { role: 'user', content: userText },
      ],
      temperature: 0,        // 确定性输出
      maxTokens: 200,        // JSON 不需要太多 token
    });

    const content = response?.choices?.[0]?.message?.content?.trim();
    if (!content) return null;

    // 解析 JSON（兼容 LLM 可能包裹 ```json ``` 的情况）
    let json = content;
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) json = jsonMatch[0];

    const extracted = JSON.parse(json);

    // 空对象 = 没有值得记住的
    if (!extracted || Object.keys(extracted).length === 0) return null;

    console.log(`[ProfileExtractor] 提取到画像:`, extracted);
    return extracted;
  } catch (err) {
    // 解析失败不报错，静默跳过
    console.warn(`[ProfileExtractor] 提取失败:`, err.message);
    return null;
  }
}

/**
 * 将提取到的画像信息合并存入 meta
 * @param {number} userId
 * @param {object} extracted - { birthday: "04-28", city: "广州" }
 */
async function mergeToProfile(userId, extracted) {
  if (!extracted || Object.keys(extracted).length === 0) return;

  try {
    const row = db.queryOne('SELECT meta FROM user_profiles WHERE user_id = ?', [userId]);
    let meta = {};
    try { meta = JSON.parse(row?.meta || '{}'); } catch (_) {}

    // 合并提取到的字段到 meta.profile（专用子对象，和其他 meta 字段隔离）
    if (!meta.profile) meta.profile = {};

    let changed = false;
    for (const [key, value] of Object.entries(extracted)) {
      if (value !== null && value !== undefined && value !== '') {
        // 只在值变化时更新
        if (meta.profile[key] !== value) {
          meta.profile[key] = value;
          changed = true;
          console.log(`[ProfileExtractor] meta.profile.${key} = "${value}"`);
        }
      }
    }

    if (changed) {
      // 记录最后更新时间
      meta.profile._updated = new Date().toISOString();

      await db.query(
        `UPDATE user_profiles SET meta = ?, updated_at = datetime('now', 'localtime') WHERE user_id = ?`,
        [JSON.stringify(meta), userId]
      );
      console.log(`[ProfileExtractor] 画像已更新 (user=${userId})`);
    }
  } catch (err) {
    console.error('[ProfileExtractor] 合并失败:', err.message);
  }
}

/**
 * 一步到位：提取 + 存储
 */
async function extractAndSave(userId, userText, llmCall) {
  const extracted = await extractProfile(userText, llmCall);
  if (extracted) {
    await mergeToProfile(userId, extracted);
  }
  return extracted;
}

module.exports = { extractProfile, mergeToProfile, extractAndSave, EXTRACTION_PROMPT };
