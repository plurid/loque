// #region imports
    // #region external
    import {
        TokenType,
    } from '../../../data/enumerations';

    import Token from '../../Token';
    // #endregion external
// #endregion imports



// #region module
class Identifier {
    private current = 0;
    private tokens: Token[];

    constructor(
        tokens: Token[],
    ) {
        this.tokens = tokens;
    }

    public identify() {
        if (this.tokens.length === 0) {
            return [];
        }

        const tokens: Token[] = [];

        while(
            !this.isAtEnd()
        ) {
            const current = this.peek();

            if (
                current.type === TokenType.SIGNIFIER
                && (this.match(TokenType.DOT) || this.match(TokenType.EOF))
            ) {
                const collectionToken = new Token(
                    TokenType.COLLECTION,
                    current.lexeme,
                    current.literal,
                    current.line,
                );
                tokens.push(collectionToken);
                this.advance();
                continue;
            }

            this.advance();
        }

        const endOfFile = this.tokens[this.tokens.length - 1];
        tokens.push(endOfFile);

        return tokens;
    }


    private isAtEnd() {
        return this.current >= this.tokens.length;
    }

    private advance() {
        this.current += 1;
    }

    private peek() {
        return this.tokens[this.current];
    }

    private match(
        tokenType: TokenType,
    ) {
        const next = this.tokens[this.current + 1];

        if (next && next.type === tokenType) {
            return true;
        }

        return false;
    }
}
// #endregion module



// #region exports
export default Identifier;
// #endregion exports
