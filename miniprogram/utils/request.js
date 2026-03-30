/**
 * 统一网络请求封装
 * 支持四种模式：dev(局域网) / tunnel(穿透) / prod(云托管公网) / cloud(云托管内网)
 *
 * ⭐ 体验版/正式版务必用 cloud 模式 —— 走 wx.cloud.callContainer 内网通道
 *    不需要域名白名单、不需要备案、不需要 HTTPS 证书
 */

const MODE = 'dev';  // ← 当前模式：'dev' | 'tunnel' | 'prod' | 'cloud'

const CLOUD_ENV = 'your-cloud-env-id';             // 云环境ID（微信云托管）
const CLOUD_SERVICE = 'your-cloud-service-name';    // 云托管服务名

const ENV = {
  dev: 'http://localhost:3900/api',
  tunnel: 'https://your-tunnel-url.loca.lt/api',
  prod: 'https://your-cloud-domain.sh.run.tcloudbase.com/api',
};

// 非 cloud 模式才有 BASE_URL
const BASE_URL = MODE !== 'cloud' ? (ENV[MODE] || ENV.dev) : '';

/**
 * 核心请求方法
 */
const request = (options) => {
  if (MODE === 'cloud') {
    return cloudRequest(options);
  }
  return httpRequest(options);
};

/**
 * ☁️ 云托管内网请求（callContainer）
 * 走微信内网通道，免域名白名单
 */
const cloudRequest = (options) => {
  return new Promise((resolve, reject) => {
    const token = wx.getStorageSync('access_token');

    wx.cloud.callContainer({
      config: { env: CLOUD_ENV },
      path: `/api${options.url}`,
      method: options.method || 'GET',
      data: options.data || {},
      header: {
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : '',
        'X-WX-SERVICE': CLOUD_SERVICE,
        ...options.header,
      },
      success: (res) => {
        if (res.statusCode === 401) {
          return refreshTokenAndRetry(options).then(resolve).catch(reject);
        }
        if (res.statusCode >= 200 && res.statusCode < 300) {
          if (res.data && res.data.code === 0) {
            resolve(res.data.data);
          } else {
            resolve(res.data);
          }
        } else {
          const msg = res.data?.message || '请求失败';
          reject({ code: res.statusCode, message: msg });
        }
      },
      fail: (err) => {
        console.error('[Request] callContainer 失败:', err);
        reject({ code: -1, message: '网络错误，请检查网络连接', detail: err });
      },
    });
  });
};

/**
 * 🌐 HTTP 直连请求（wx.request）
 * 用于 dev/tunnel/prod 模式
 */
const httpRequest = (options) => {
  return new Promise((resolve, reject) => {
    const token = wx.getStorageSync('access_token');

    wx.request({
      url: `${BASE_URL}${options.url}`,
      method: options.method || 'GET',
      data: options.data || {},
      header: {
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : '',
        ...options.header,
      },
      success: (res) => {
        if (res.statusCode === 401) {
          return refreshTokenAndRetry(options).then(resolve).catch(reject);
        }
        if (res.statusCode >= 200 && res.statusCode < 300) {
          if (res.data && res.data.code === 0) {
            resolve(res.data.data);
          } else {
            resolve(res.data);
          }
        } else {
          const msg = res.data?.message || '请求失败';
          reject({ code: res.statusCode, message: msg });
        }
      },
      fail: (err) => {
        reject({ code: -1, message: '网络错误，请检查网络连接', detail: err });
      },
    });
  });
};

/**
 * Token 刷新 + 重试
 */
const refreshTokenAndRetry = async (originalOptions) => {
  const refreshToken = wx.getStorageSync('refresh_token');
  if (!refreshToken) {
    clearAuth();
    throw { code: 401, message: '登录已过期' };
  }

  try {
    const res = await request({
      url: '/auth/refresh',
      method: 'POST',
      data: { refresh_token: refreshToken },
    });
    wx.setStorageSync('access_token', res.accessToken || res.access_token);
    return request(originalOptions);
  } catch (err) {
    clearAuth();
    throw { code: 401, message: '登录已过期' };
  }
};

function clearAuth() {
  wx.removeStorageSync('access_token');
  wx.removeStorageSync('refresh_token');
}

module.exports = { request, BASE_URL };
