// #region module
export enum TokenType {
    // Single-character tokens.
    DOT, COLON, AMPERSAND, PIPE, BANG,
    LEFT_CURLY_BRACKET, RIGHT_CURLY_BRACKET,
    LESS, GREATER,


    // Entities.
    SIGNIFIER,

    COLLECTION,
    DOCUMENT,
    KEY, VALUE,
    CURSOR_START, CURSOR_END,


    // Relationships.
    EQUAL, NOT_EQUAL,
    LESS_THAN, GREATER_THAN,
    LESS_EQUAL_THAN, GREATER_EQUAL_THAN,
    AND, OR,


    // Keywords.
    FIRST, LAST,
    ABOVE, BELOW,
    ALL,


    EOF,
}
// #endregion module
