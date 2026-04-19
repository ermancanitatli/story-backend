(function (global) {
  'use strict';
  const DEFAULT_HEADERS = {
    'Content-Type': 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
  };

  async function request(method, url, body) {
    const init = { method, headers: { ...DEFAULT_HEADERS }, credentials: 'same-origin' };
    if (body !== undefined && body !== null) init.body = JSON.stringify(body);
    let res;
    try {
      res = await fetch(url, init);
    } catch (err) {
      window.panelToast?.error('Ağ hatası: ' + err.message);
      throw err;
    }
    if (res.status === 401) {
      // redirect to login
      window.location.href = '/panel/login';
      return new Promise(() => {}); // never resolve
    }
    const contentType = res.headers.get('content-type') || '';
    const isJson = contentType.includes('application/json');
    const data = isJson ? await res.json() : await res.text();
    if (!res.ok) {
      const msg = (isJson && data?.error?.message) || (typeof data === 'string' ? data : 'İstek başarısız');
      window.panelToast?.error(msg);
      const err = new Error(msg);
      err.status = res.status;
      err.body = data;
      throw err;
    }
    return data;
  }

  global.panelApi = {
    get:    (url)          => request('GET', url),
    post:   (url, body)    => request('POST', url, body),
    put:    (url, body)    => request('PUT', url, body),
    patch:  (url, body)    => request('PATCH', url, body),
    delete: (url, body)    => request('DELETE', url, body),
    del:    (url, body)    => request('DELETE', url, body),
  };
})(window);
