import { describe, expect, test } from "vitest";

import { activateLanguage, translate, type TranslationKey } from ".";

describe("translate", () => {
  test("运行时缺失翻译键时返回键名而不是中断渲染", () => {
    const missingKey = "runtime.missing" as TranslationKey;

    expect(translate("zh-CN", missingKey)).toBe("runtime.missing");
  });

  test("英文语言包按需加载并应用单复数规则", async () => {
    await activateLanguage("en-US");

    expect(
      translate("en-US", "shell.datasetRows", { name: "Sample", count: 1 }),
    ).toBe("Sample · 1 row");
    expect(
      translate("en-US", "shell.datasetRows", { name: "Sample", count: 2 }),
    ).toBe("Sample · 2 rows");
  });
});
