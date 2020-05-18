import { Router } from "./router.ts";
import { serve } from "./deps.ts";
import { MiddlewareProps, ListenProps } from "./types.ts";
import { Request } from "./request.ts";
import { Response } from "./response.ts";
import { checkPathAndParseURLParams, fresh } from "./utils.ts";
import { cache, getCached } from "./state.ts";

export class App extends Router {
  private handleRequest: any = async (
    request: Request,
    response: Response,
    current: MiddlewareProps[],
  ) => {
    const currentMethod = request.method;
    const currentUrl = request.url.pathname;
    let continueToken = true;
    response.readyToSend.then((e) => continueToken = false);
    try {
      if (current) {
        for await (const middleware of current) {
          if (
            middleware.method === currentMethod || middleware.method === "ALL"
          ) {
            if (!middleware.url) {
              middleware.callBack
                ? await middleware.callBack(request, response)
                : await this.handleRequest(request, response, middleware.next);
            } else if (
              checkPathAndParseURLParams(request, middleware.url, currentUrl)
            ) {
              middleware.callBack
                ? await middleware.callBack(request, response)
                : await this.handleRequest(request, response, middleware.next);
            }
          }
          if (!continueToken) {
            cache(request, response, middleware);
            break;
          }
        }

        // await response.end();
      }
    } catch (error) {
      console.log(error);
    }
  };

  private show = (e: any) => {
    console.log(e);
    if (e.next) {
      e.next.forEach((a: any) => {
        this.show(a);
      });
    }
  };

  public listen = async (
    { port, debug = false, optimize = true }: ListenProps,
  ) => {
    debug && console.log(JSON.stringify(this.middlewares, null, 2));

    const s = serve({ port });
    for await (const req of s) {
      const request = new Request(req);
      const response = new Response(req, request);

      this.checkCacheAndSend(request, response, { optimize });
    }
  };

  private checkCacheAndSend = async (
    req: Request,
    res: Response,
    { optimize }: any,
  ) => {
    const cached = getCached(req.url.pathname, req.method);

    if (!cached) {
      this.normalProcedure(req, res);
      return;
    }

    if (!fresh(req, cached.res)) {
      this.normalProcedure(req, res);
      return;
    }

    res.setHeaders(cached.res.headers);
    res.pending = cached.res.pending;
    this.handleRequest(req, res, optimize ? cached.lastMiddleware : this.middlewares);
    return;
  };

  private normalProcedure = (req: Request, res: Response) => {
    this.handleRequest(req, res, this.middlewares);
  };
}
