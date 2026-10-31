import { beforeEach, describe, expect, it, vi } from "vitest";

const runContent = vi.fn();
vi.mock("../runtime/dispatch.js", () => ({ runContent }));

const { llmJudge } = await import("./llm-judge.js");

const reply = (text: string) => ({ text });
const GOOD = '{"results":[{"practice":"p","passed":true,"evidence":"e"}]}';
const BROKEN = '{"results":[{"practice":"p","passed":true,"evidence":"a "quoted" word"}]}';

describe("llmJudge", () => {
  beforeEach(() => runContent.mockReset());

  it("makes one call when the first reply parses", async () => {
    runContent.mockResolvedValueOnce(reply(GOOD));
    const v = await llmJudge("out", ["p"]);
    expect(v.score).toBe(1);
    expect(runContent).toHaveBeenCalledTimes(1);
  });

  it("strips a code fence around the JSON", async () => {
    runContent.mockResolvedValueOnce(reply("```json\n" + GOOD + "\n```"));
    expect((await llmJudge("out", ["p"])).passed).toBe(1);
  });

  it("asks again, naming the parse error, when the JSON is broken", async () => {
    runContent.mockResolvedValueOnce(reply(BROKEN)).mockResolvedValueOnce(reply(GOOD));
    const v = await llmJudge("out", ["p"]);
    expect(v.passed).toBe(1);
    expect(runContent).toHaveBeenCalledTimes(2);
    expect(runContent.mock.calls[1][0]).toContain("not valid JSON");
  });

  it("gives up with the parse error after two corrections", async () => {
    runContent.mockResolvedValue(reply(BROKEN));
    await expect(llmJudge("out", ["p"])).rejects.toThrow(/JSON/);
    expect(runContent).toHaveBeenCalledTimes(3);
  });
});
