/**
 * 统一案由目录：案卷列表与勘察记录共用同一份，两处不再各写各的。
 * 沿用既有立案口径核定——每条案由对应一条立案依据，案由缺失的案件先挂起。
 */

export interface ReasonEntry {
  code: string // 案由编码
  name: string // 案由名称（登记时实际落库的值）
  category: string // 违规定性
  basis: string // 立案依据口径
}

// 「偷热、私接、改表」是稽查队口头最常说的三类，这里展开为既有立案口径。
export const REASON_CATALOG: ReasonEntry[] = [
  {
    code: 'WJ-01',
    name: '擅自启闭用热阀门偷取用热',
    category: '偷热',
    basis: '《供热计量与收费管理规程》违规用热处置口径第1项：擅自启闭供热阀门',
  },
  {
    code: 'WJ-02',
    name: '绕过热计量装置用热',
    category: '偷热',
    basis: '《供热计量与收费管理规程》违规用热处置口径第2项：旁通、短路等绕过计量',
  },
  {
    code: 'WJ-03',
    name: '擅自在供热设施上私接管道',
    category: '私接',
    basis: '《供热计量与收费管理规程》违规用热处置口径第3项：私接供热管道增加用热面积',
  },
  {
    code: 'WJ-04',
    name: '擅自扩大用热面积',
    category: '私接',
    basis: '《供热计量与收费管理规程》违规用热处置口径第4项：私自增挂面积、加装散热设施',
  },
  {
    code: 'WJ-05',
    name: '擅自改装损坏热计量表',
    category: '改表',
    basis: '《供热计量与收费管理规程》违规用热处置口径第5项：改装、损坏、干扰计量表',
  },
  {
    code: 'WJ-06',
    name: '擅自排放或取用供热热水',
    category: '偷热',
    basis: '《供热计量与收费管理规程》违规用热处置口径第6项：私自放水取用热能',
  },
  {
    code: 'WJ-07',
    name: '擅自改变用热性质',
    category: '私接',
    basis: '《供热计量与收费管理规程》违规用热处置口径第7项：民用改商用、改变用途',
  },
  {
    code: 'WJ-08',
    name: '其他违规用热',
    category: '其他',
    basis: '《供热计量与收费管理规程》违规用热处置口径第8项：其他经核实的违规用热',
  },
]

/** 按名称精确取目录条目。 */
export function findReasonByName(name: string): ReasonEntry | undefined {
  const trimmed = name.trim()
  return REASON_CATALOG.find((entry) => entry.name === trimmed)
}

/**
 * 核定：把现场自由填写的原始案由对到统一目录。
 * 先精确匹配名称，再按条目特征词、类目关键字做包含式匹配，
 * 让现场口语（如“私接了根管子”“表被改过”“偷热”）也能对回既有立案口径；
 * 只能压到类目、压不到具体条目的，不替人拍板，返回未核定挂起补正。
 */
export function adjudgeReason(raw: string): ReasonEntry | undefined {
  const trimmed = raw.trim()
  if (!trimmed) {
    return undefined
  }
  const exact = findReasonByName(trimmed)
  if (exact) {
    return exact
  }

  const hitByName = REASON_CATALOG.filter(
    (entry) => trimmed.includes(entry.name) || entry.name.includes(trimmed),
  )
  if (hitByName.length === 1) {
    return hitByName[0]
  }

  // 特征词：能唯一定位到具体条目的现场说法
  const FEATURE_KEYWORDS: { words: string[]; reason: string }[] = [
    { words: ['私接管道', '接管子', '私拉管道', '私接了'], reason: '擅自在供热设施上私接管道' },
    { words: ['扩大面积', '加暖气片', '加装散热', '增挂面积'], reason: '擅自扩大用热面积' },
    { words: ['改表', '调表', '拆表', '表被改', '动了表'], reason: '擅自改装损坏热计量表' },
    { words: ['旁通', '绕过表', '绕开表', '短路'], reason: '绕过热计量装置用热' },
    { words: ['放水', '放热水', '放暖气水'], reason: '擅自排放或取用供热热水' },
    { words: ['开阀门', '启阀门', '私自开阀'], reason: '擅自启闭用热阀门偷取用热' },
    { words: ['改变用途', '民改商', '住改商', '用热性质'], reason: '擅自改变用热性质' },
  ]
  for (const feature of FEATURE_KEYWORDS) {
    if (feature.words.some((word) => trimmed.includes(word))) {
      return REASON_CATALOG.find((entry) => entry.name === feature.reason)
    }
  }

  // 类目口语（“偷热/私接”）只能定类、定不到具体条目：交回人工核定，挂起补正。
  return undefined
}

export function reasonBasis(name: string): string {
  return findReasonByName(name)?.basis ?? ''
}
