import { analyzeSvg, fixSvg } from "../src/index.ts";
self.onmessage = ({ data: { svg, options } }) => {
  try {
    const before = analyzeSvg(svg, options);
    const result = fixSvg(svg, options);
    self.postMessage({
      before,
      result,
      after: analyzeSvg(result.svg, options),
    });
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
