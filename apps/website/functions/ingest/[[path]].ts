export const onRequest: PagesFunction = async (context) => {
	const url = new URL(context.request.url);
	const pathname = url.pathname.replace(/^\/ingest/, '');
	const search = url.search;
	const pathWithParams = pathname + search;

	if (pathname.startsWith('/static/') || pathname.startsWith('/array/')) {
		return retrieveAsset(pathWithParams);
	}

	return forwardRequest(context.request, pathWithParams);
};

const API_HOST = 'us.i.posthog.com';
const ASSET_HOST = 'us-assets.i.posthog.com';

async function retrieveAsset(pathname: string): Promise<Response> {
	return fetch(`https://${ASSET_HOST}${pathname}`);
}

async function forwardRequest(request: Request, pathWithSearch: string): Promise<Response> {
	const ip = request.headers.get('CF-Connecting-IP') || '';
	const originHeaders = new Headers(request.headers);
	originHeaders.delete('cookie');
	originHeaders.set('X-Forwarded-For', ip);

	const originRequest = new Request(`https://${API_HOST}${pathWithSearch}`, {
		method: request.method,
		headers: originHeaders,
		body:
			request.method !== 'GET' && request.method !== 'HEAD'
				? await request.arrayBuffer()
				: null,
		redirect: request.redirect,
	});

	return await fetch(originRequest);
}
