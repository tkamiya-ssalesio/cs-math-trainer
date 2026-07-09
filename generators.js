/**
 * CS Math Trainer - 問題生成モジュール
 * 将来のデータ量計算などの拡張を想定し、カテゴリ別・難易度別の生成関数をモジュール化して設計。
 */

const Generators = {
  // 乱数生成ヘルパー (min以上 max以下)
  getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  },

  // 難易度に応じた数値の範囲とビット数を取得
  getRangeForDifficulty(difficulty) {
    switch (difficulty) {
      case 'easy':
        return { min: 1, max: 15, bits: 4 };
      case 'hard':
        return { min: 256, max: 65535, bits: 16 };
      case 'medium':
      default:
        return { min: 16, max: 255, bits: 8 };
    }
  },

  // 1. 2進数 → 10進数
  'bin-to-dec'(difficulty) {
    const range = this.getRangeForDifficulty(difficulty);
    const decimalValue = this.getRandomInt(range.min, range.max);
    const binaryString = decimalValue.toString(2);
    
    // 桁数を揃える（パディング）
    const paddedBinary = binaryString.padStart(range.bits, '0');

    return {
      question: paddedBinary,
      answer: decimalValue.toString(),
      displayMeta: '2進数 ➔ 10進数',
      placeholder: '10進数で数値を入力...',
      inputType: 'number'
    };
  },

  // 2. 10進数 → 2進数
  'dec-to-bin'(difficulty) {
    const range = this.getRangeForDifficulty(difficulty);
    const decimalValue = this.getRandomInt(range.min, range.max);
    const binaryString = decimalValue.toString(2).padStart(range.bits, '0');

    return {
      question: decimalValue.toString(),
      answer: binaryString,
      displayMeta: '10進数 ➔ 2進数',
      placeholder: '2進数(0と1)で入力、またはスイッチをトグル...',
      inputType: 'binary',
      bits: range.bits // UI生成用
    };
  },

  // 3. 10進数 → 16進数
  'dec-to-hex'(difficulty) {
    const range = this.getRangeForDifficulty(difficulty);
    const decimalValue = this.getRandomInt(range.min, range.max);
    const hexString = decimalValue.toString(16).toUpperCase();

    return {
      question: decimalValue.toString(),
      answer: hexString,
      displayMeta: '10進数 ➔ 16進数',
      placeholder: '16進数(0-9, A-F)を入力...',
      inputType: 'text'
    };
  },

  // 4. 16進数 → 10進数
  'hex-to-dec'(difficulty) {
    const range = this.getRangeForDifficulty(difficulty);
    const decimalValue = this.getRandomInt(range.min, range.max);
    const hexString = decimalValue.toString(16).toUpperCase();

    return {
      question: hexString,
      answer: decimalValue.toString(),
      displayMeta: '16進数 ➔ 10進数',
      placeholder: '10進数で数値を入力...',
      inputType: 'number'
    };
  },

  // 5. 2進数 → 16進数
  'bin-to-hex'(difficulty) {
    const range = this.getRangeForDifficulty(difficulty);
    const decimalValue = this.getRandomInt(range.min, range.max);
    const binaryString = decimalValue.toString(2).padStart(range.bits, '0');
    const hexString = decimalValue.toString(16).toUpperCase();

    return {
      question: binaryString,
      answer: hexString,
      displayMeta: '2進数 ➔ 16進数',
      placeholder: '16進数(0-9, A-F)を入力...',
      inputType: 'text'
    };
  },

  // 6. 16進数 → 2進数
  'hex-to-bin'(difficulty) {
    const range = this.getRangeForDifficulty(difficulty);
    const decimalValue = this.getRandomInt(range.min, range.max);
    const hexString = decimalValue.toString(16).toUpperCase();
    const binaryString = decimalValue.toString(2).padStart(range.bits, '0');

    return {
      question: hexString,
      answer: binaryString,
      displayMeta: '16進数 ➔ 2進数',
      placeholder: '2進数(0と1)で入力、またはスイッチをトグル...',
      inputType: 'binary',
      bits: range.bits
    };
  }
};

/**
 * 汎用の問題生成インターフェース
 * @param {string} mode - 'bin-to-dec', 'dec-to-bin' など
 * @param {string} difficulty - 'easy', 'medium', 'hard'
 * @returns {object} 生成された問題データ
 */
function generateQuestion(mode, difficulty) {
  if (Generators[mode]) {
    return Generators[mode](difficulty);
  }
  console.error(`Unknown mode: ${mode}`);
  return null;
}
