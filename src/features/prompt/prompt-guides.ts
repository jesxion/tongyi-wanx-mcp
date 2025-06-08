/**
 * 提示词指导数据模块
 * 包含各种风格、技巧和示例的提示词指南
 */

export interface PromptGuide {
  name: string;
  description: string;
  formula?: string;
  example?: string;
  types?: Record<string, string>;
}

export interface PromptGuides {
  basic_formula: PromptGuide;
  advanced_formula: PromptGuide;
  shot_types: PromptGuide;
  perspectives: PromptGuide;
  lens_types: PromptGuide;
  styles: PromptGuide;
  lighting: PromptGuide;
}

/**
 * 提示词指导数据集合
 */
export const promptGuides: PromptGuides = {
  basic_formula: {
    name: "基础提示词公式",
    description: "适用于初次尝试AI创作的新用户，简单自由的提示词可生成更具有想象力的图像",
    formula: "主体 + 场景 + 风格",
    example: "25岁中国女孩，圆脸，看着镜头，优雅的民族服装，商业摄影，室外，电影级光照，半身特写，精致的淡妆，锐利的边缘。"
  },
  
  advanced_formula: {
    name: "进阶提示词公式", 
    description: "适用于有一定AI生图使用经验的用户，在基础公式之上添加更丰富细致的描述",
    formula: "主体（主体描述）+ 场景（场景描述）+ 风格（定义风格）+ 镜头语言 + 氛围词 + 细节修饰",
    example: "由羊毛毡制成的大熊猫，头戴大檐帽，穿着蓝色警服马甲，扎着腰带，携带警械装备，戴着蓝色手套，穿着皮鞋，大步奔跑姿态，毛毡效果，周围是动物王国城市街道商户，高级滤镜，路灯，动物王国，奇妙童趣，憨态可掬，夜晚，明亮，自然，可爱，4K，毛毡材质，摄影镜头，居中构图，毛毡风格，皮克斯风格，逆光。"
  },
  
  shot_types: {
    name: "景别参考",
    description: "不同景别类型的提示词参考",
    types: {
      "特写": "特写镜头 | 高清相机，情绪大片，日落，特写人像。",
      "近景": "近景镜头 | 近景镜头，18岁的中国女孩，古代服饰，圆脸，看着镜头，民族优雅的服装，商业摄影，室外，电影级光照，半身特写，精致的淡妆，锐利的边缘。",
      "中景": "中景镜头 | 电影时尚魅力摄影，年轻亚洲女子，中国苗族女孩，圆脸，看着镜头，民族深色优雅的服装，中广角镜头，阳光明媚，乌托邦式，由高清相机拍摄。",
      "远景": "远景镜头 | 展示了远景镜头，在壮丽的雪山背景下，两个小小的人影站在远处山顶，背对着镜头，静静地观赏着日落的美景。"
    }
  },
  
  perspectives: {
    name: "视角参考",
    description: "不同镜头视角的提示词参考",
    types: {
      "平视": "平视视角 | 图像展示了从平视视角捕捉到的草地景象，一群羊悠闲地在绿茵茵的草地上低头觅食。",
      "俯视": "俯视视角 | 我从空中俯瞰冰湖，中心有一艘小船，周围环绕着漩涡图案和充满活力的蓝色海水。",
      "仰视": "仰视视角 | 展示了热带地区的壮观景象，高大的椰子树如同参天巨人般耸立，镜头采用仰视视角。",
      "航拍": "航拍视角 | 展示了大雪，村庄，道路，灯火，树木。航拍视角，逼真效果。"
    }
  },
  
  lens_types: {
    name: "镜头类型参考",
    description: "不同镜头拍摄类型的提示词参考",
    types: {
      "微距": "微距镜头 | cherries, carbonated water, macro, professional color grading, clean sharp focus, commercial high quality, magazine winning photography, hyper realistic, uhd, 8K",
      "超广角": "超广角镜头 | 超广角镜头，碧海蓝天下的海岛，阳光透过树叶缝隙，洒下斑驳光影。",
      "长焦": "长焦镜头 | 展示了长焦镜头下，一只猎豹在郁郁葱葱的森林中站立，面对镜头，背景被巧妙地虚化。",
      "鱼眼": "鱼眼镜头 | 展示了在鱼眼镜头的特殊视角下，一位女性站立着并直视镜头的场景。"
    }
  },
  
  styles: {
    name: "风格参考", 
    description: "不同艺术风格的提示词参考",
    types: {
      "3D卡通": "网球女运动员，短发，白色网球服，黑色短裤，侧身回球，3D卡通风格。",
      "废土风": "火星上的城市，废土风格。",
      "点彩画": "一座白色的可爱的小房子，茅草房，一片被雪覆盖的草原，大胆使用点彩色画，莫奈感，清晰的笔触。",
      "超现实": "深灰色大海中一条粉红色的发光河流，具有极简、美丽和审美的氛围，具有超现实风格的电影灯光。",
      "水彩": "浅水彩，咖啡馆外，明亮的白色背景，更少细节，梦幻，吉卜力工作室。",
      "粘土": "粘土风格，蓝色毛衣的小男孩，棕色卷发，深蓝色贝雷帽，画板，户外，海边，半身照。",
      "写实": "篮子，葡萄，野餐布，超写实静物摄影，微距镜头，丁达尔效应。",
      "陶瓷": "展示了高细节的瓷器小狗，它静静地躺在桌上，脖子上系着一个精致的铃铛。",
      "3D": "中国龙，可爱的中国龙睡在白云上，迷人的花园，在晨雾中，特写，正面，3D立体，C4D渲染，32k超高清。",
      "水墨": "兰花，水墨画，留白，意境，吴冠中风格，细腻的笔触，宣纸的纹理。",
      "折纸": "折纸杰作，牛皮纸材质的熊猫，森林背景，中景，极简主义，背光，最佳品质。",
      "工笔": "晨曦中，一枝寒梅傲立雪中，花瓣细腻如丝，露珠轻挂，展现工笔画之精致美。",
      "国风水墨": "国风水墨风格，一个长长黑发的男人，金色的发簪，飞舞着金色的蝴蝶，白色的服装，高细节，高质量，深蓝色背景，背景中有若隐若现的水墨竹林。"
    }
  },
  
  lighting: {
    name: "光线参考",
    description: "不同光线类型的提示词参考", 
    types: {
      "自然光": "太阳光、月光、星光 | 图像展示了早晨的阳光洒在一片茂密森林的地面上，银白色的光芒穿透树梢，形成斑驳陆离的光影。",
      "逆光": "逆光 | 展示了在逆光环境下，模特轮廓线条更加分明，金色的光线以及丝绸环绕在模特周围，形成梦幻般的光环效果。",
      "霓虹灯": "霓虹灯 | 雨后的城市街景，霓虹灯光在湿润的地面上反射出绚丽多彩的光芒。",
      "氛围光": "氛围光 | 夜晚河边的浪漫艺术景象，氛围灯温柔地照亮了水面，一群莲花灯缓缓飘向河心，灯光与水面波光粼粼相互辉映。"
    }
  }
};

/**
 * 获取所有可用的提示词类别
 * @returns 提示词类别列表
 */
export function getAvailableCategories(): string[] {
  return Object.keys(promptGuides).filter(key => 
    promptGuides[key as keyof PromptGuides].types
  );
}

/**
 * 获取指定类别的提示词数据
 * @param category 类别名称
 * @returns 提示词数据，如果类别不存在则返回 null
 */
export function getPromptGuideByCategory(category: string): PromptGuide | null {
  const guide = promptGuides[category as keyof PromptGuides];
  return guide || null;
}

/**
 * 验证类别是否有效
 * @param category 类别名称
 * @returns 是否有效
 */
export function isValidCategory(category: string): boolean {
  const guide = promptGuides[category as keyof PromptGuides];
  return guide && 'types' in guide && !!guide.types;
}

/**
 * 获取所有风格类型
 * @returns 风格类型数组
 */
export function getAllStyles(): string[] {
  return Object.keys(promptGuides.styles.types || {});
}

/**
 * 获取所有景别类型
 * @returns 景别类型数组
 */
export function getAllShotTypes(): string[] {
  return Object.keys(promptGuides.shot_types.types || {});
}

/**
 * 搜索提示词内容
 * @param searchTerm 搜索词
 * @returns 匹配的提示词结果
 */
export function searchPrompts(searchTerm: string): Array<{
  category: string;
  type: string;
  content: string;
}> {
  const results: Array<{category: string; type: string; content: string;}> = [];
  
  Object.entries(promptGuides).forEach(([category, guide]) => {
    if (guide.types) {
      Object.entries(guide.types).forEach(([type, content]) => {
        if (type.includes(searchTerm) || (content as string).includes(searchTerm)) {
          results.push({ category, type, content: content as string });
        }
      });
    }
  });
  
  return results;
}
