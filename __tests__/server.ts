import type { CustomErrorSerialized } from '@block65/custom-error';
import type { RequestListener } from 'node:http';

export const requestListener: RequestListener = (req, res) => {
  switch (req.url) {
    case '/200':
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify([1, 2, 3]));
      break;
    case '/204':
      res.writeHead(204);
      res.end();
      break;
    case '/my-headers':
      res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
      res.end(
        JSON.stringify({
          ...req.headers,
          host: 'redacted', // redacted as it changes every test run
        }),
      );
      break;
    case '/index.html':
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<h1>Hello</h1>');
      break;
    case '/json-error':
      res.writeHead(400, { 'content-type': 'application/json; charset=utf-8' });
      res.end(
        JSON.stringify({
          message: 'Data should be array',
          code: 9,
          status: 'FAILED_PRECONDITION',
        } as CustomErrorSerialized),
      );
      break;
    default:
      res.writeHead(404, { 'content-type': 'text/html' });
      res.end('<h1>Not Found</h1>');
      break;
  }
};
