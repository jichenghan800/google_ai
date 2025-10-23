# ui-localization Specification

## Purpose
TBD - created by archiving change update-language-toggle. Update Purpose after archive.
## Requirements
### Requirement: Toggle UI Language
The client MUST allow users to switch the interface between Chinese and English with a single control, and immediately reflect the selected language across visible UI elements.

#### Scenario: Switch to English
- **GIVEN** 用户当前界面语言为中文
- **WHEN** 用户点击语言切换按钮切换到英文
- **THEN** 主导航、按钮、提示文本和关键状态标签应更新为英文展示
- **AND** 后续出现的新 toast 或提示内容使用英文

#### Scenario: Switch back to Chinese
- **GIVEN** 界面已经显示为英文
- **WHEN** 用户再次使用语言切换按钮选择中文
- **THEN** 与英文对应的界面元素恢复为中文描述
- **AND** 客户端不需要刷新即可完成更新

#### Scenario: Persist selection
- **GIVEN** 用户已经选择英文界面并刷新页面
- **WHEN** 应用重新加载
- **THEN** 默认语言应继续为英文，并且语言切换按钮展示“En”
- **AND** 所有已接入的界面文案仍保持英文状态

