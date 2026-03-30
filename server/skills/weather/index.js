/**
 * Skill: 天气查询
 * 数据源: wttr.in（免费、无需注册、支持中英文城市名）
 * 功能: 实时天气 + 3天预报 + 穿搭/出行建议
 */
const axios = require('axios');

// 英文天气描述 → 中文翻译
const WEATHER_CN = {
  'Clear': '晴朗 ☀️',
  'Sunny': '晴天 ☀️',
  'Partly cloudy': '多云 ⛅',
  'Cloudy': '阴天 ☁️',
  'Overcast': '阴天 ☁️',
  'Mist': '薄雾 🌫️',
  'Fog': '大雾 🌫️',
  'Patchy rain possible': '可能有零星小雨 🌦️',
  'Patchy rain nearby': '附近有零星降雨 🌦️',
  'Light rain': '小雨 🌧️',
  'Light rain shower': '阵雨 🌦️',
  'Moderate rain': '中雨 🌧️',
  'Moderate rain at times': '间歇中雨 🌧️',
  'Heavy rain': '大雨 🌧️',
  'Heavy rain at times': '间歇大雨 🌧️',
  'Light drizzle': '毛毛雨 🌦️',
  'Patchy light rain': '零星小雨 🌦️',
  'Patchy light drizzle': '零星毛毛雨 🌦️',
  'Thundery outbreaks possible': '可能有雷阵雨 ⛈️',
  'Patchy light rain with thunder': '雷阵雨 ⛈️',
  'Moderate or heavy rain with thunder': '雷暴雨 ⛈️',
  'Light snow': '小雪 🌨️',
  'Moderate snow': '中雪 🌨️',
  'Heavy snow': '大雪 ❄️',
  'Blizzard': '暴风雪 🌨️',
};

function translateWeather(en) {
  if (!en) return '未知';
  return WEATHER_CN[en] || en;
}

// 根据天气给出贴心建议
function getWeatherTips(tempC, weatherDesc, humidity) {
  const tips = [];
  const temp = parseInt(tempC);
  
  // 温度建议
  if (temp >= 35) tips.push('🥵 高温预警！注意防暑降温，多喝水');
  else if (temp >= 30) tips.push('☀️ 天气较热，建议穿短袖、注意防晒');
  else if (temp >= 22) tips.push('😊 温度舒适，适合户外活动');
  else if (temp >= 15) tips.push('🧥 温度稍凉，建议加件薄外套');
  else if (temp >= 5) tips.push('🧣 天气较冷，注意保暖');
  else tips.push('🥶 天气寒冷，多穿衣服注意保暖！');

  // 天气建议
  const desc = (weatherDesc || '').toLowerCase();
  if (desc.includes('rain') || desc.includes('drizzle') || desc.includes('shower')) {
    tips.push('🌂 记得带伞！外出注意防雨');
  }
  if (desc.includes('thunder')) {
    tips.push('⚡ 有雷电风险，尽量避免户外活动');
  }
  if (desc.includes('snow') || desc.includes('blizzard')) {
    tips.push('❄️ 有降雪，路面可能湿滑，出行小心');
  }
  if (desc.includes('fog') || desc.includes('mist')) {
    tips.push('🌫️ 能见度低，驾车请注意安全');
  }

  // 湿度建议
  if (parseInt(humidity) > 85) {
    tips.push('💧 湿度较高，体感会比实际温度更闷热');
  }

  // 游戏建议（ZhijiClaw 特色！）
  if (desc.includes('rain') || desc.includes('thunder') || temp >= 35 || temp <= 0) {
    tips.push('🎮 不适合出门？正好宅家打CF！来几局排位吧~');
  }

  return tips;
}

class WeatherSkill {
  static async execute({ user, action, params, profile }) {
    // 城市优先级：params.city > profile.meta.city > 默认深圳
    let city = params.city;
    if (!city && profile) {
      try {
        const meta = JSON.parse(profile.meta || '{}');
        city = meta.city;
      } catch (_) {}
    }
    if (!city) city = '深圳';

    switch (action) {
      case 'query':
        return WeatherSkill.queryWeather(city);
      case 'forecast':
        return WeatherSkill.getForecast(city);
      default:
        return WeatherSkill.queryWeather(city);
    }
  }

  /**
   * 查询当前天气 + 简要预报
   */
  static async queryWeather(city) {
    if (!city) {
      return {
        reply: `🌤️ 还不知道你在哪个城市呢～\n\n告诉我你的城市（比如"我在广州"），以后查天气就不用每次都说了！`,
        chips: ['我在广州', '我在北京', '我在上海'],
      };
    }
    
    try {
      const res = await axios.get(`https://wttr.in/${encodeURIComponent(city)}?format=j1`, {
        timeout: 8000,
        headers: { 'Accept-Language': 'zh-CN' },
      });

      const data = res.data;
      const cur = data.current_condition?.[0];
      if (!cur) {
        return {
          reply: `😅 主人，没查到「${city}」的天气信息，换个城市名试试？\n\n💡 支持中文城市名，如：深圳、北京、上海`,
          chips: ['深圳天气', '北京天气', '上海天气'],
        };
      }

      const weatherEn = cur.weatherDesc?.[0]?.value || '';
      const weatherCn = translateWeather(weatherEn);
      const temp = cur.temp_C;
      const feelsLike = cur.FeelsLikeC;
      const humidity = cur.humidity;
      const wind = cur.windspeedKmph;
      const uv = cur.uvIndex;
      const visibility = cur.visibility;

      // 3天预报
      const forecast = (data.weather || []).slice(0, 3);
      const forecastLines = forecast.map(d => {
        const desc = d.hourly?.[4]?.weatherDesc?.[0]?.value || '';
        return `| ${d.date} | ${translateWeather(desc)} | ${d.mintempC}°~${d.maxtempC}° |`;
      });

      // 贴心建议
      const tips = getWeatherTips(temp, weatherEn, humidity);

      const reply = [
        `🌤️ **${city}实时天气**`,
        '',
        `${weatherCn}`,
        `🌡️ 温度 **${temp}°C**（体感 ${feelsLike}°C）`,
        `💧 湿度 ${humidity}% · 💨 风速 ${wind}km/h`,
        `👀 能见度 ${visibility}km · ☀️ 紫外线 ${uv}`,
        '',
        '📅 **未来3天预报**',
        '| 日期 | 天气 | 温度 |',
        '|------|------|------|',
        ...forecastLines,
        '',
        '💡 **贴心提醒**',
        ...tips.map(t => `• ${t}`),
      ].join('\n');

      return {
        reply,
        chips: ['明天天气', '穿什么合适', '适合打排位吗'],
        data: {
          city,
          temp: parseInt(temp),
          feelsLike: parseInt(feelsLike),
          humidity: parseInt(humidity),
          weather: weatherCn,
          forecast: forecast.map(d => ({
            date: d.date,
            min: parseInt(d.mintempC),
            max: parseInt(d.maxtempC),
          })),
        },
      };
    } catch (err) {
      console.error('[Weather] 查询失败:', err.message);
      return {
        reply: `😅 主人，天气查询暂时有点问题（${err.message?.slice(0, 30)}）\n\n稍后再试试吧~`,
        chips: ['重试天气查询', '换个城市'],
      };
    }
  }

  /**
   * 获取未来3天详细预报
   */
  static async getForecast(city) {
    // 复用 queryWeather，它已经包含了预报数据
    return WeatherSkill.queryWeather(city);
  }
}

module.exports = WeatherSkill;
