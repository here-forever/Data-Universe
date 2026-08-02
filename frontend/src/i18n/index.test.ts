import { describe, expect, test } from "vitest";

import { translate, type TranslationKey } from ".";

describe("translate", () => {
  test("运行时缺失翻译键时返回键名而不是中断渲染", () => {
    const missingKey = "runtime.missing" as TranslationKey;

    expect(translate("zh-CN", missingKey)).toBe("runtime.missing");
  });
});
