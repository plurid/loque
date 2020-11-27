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

        const pushAdvance = (
            token: Token,
        ) => {
            tokens.push(token);
            this.advance();
        }

        while(
            !this.isAtEnd()
        ) {
            const current = this.peek();
            const previous = this.previous();

            if (
                previous
                && current.type === TokenType.SIGNIFIER
                && (
                    previous.type === TokenType.DOT
                    || previous.type === TokenType.AMPERSAND
                    || previous.type === TokenType.PIPE
                )
            ) {
                const keyToken = this.tokenFrom(
                    TokenType.KEY,
                    current,
                );

                pushAdvance(keyToken);
                continue;
            }

            if (
                previous
                && current.type === TokenType.SIGNIFIER
                && previous.type === TokenType.COLON
            ) {
                const valueToken = this.tokenFrom(
                    TokenType.VALUE,
                    current,
                );

                pushAdvance(valueToken);
                continue;
            }


            if (
                previous
                && current.type === TokenType.COLON
                && previous.type === TokenType.SIGNIFIER
                && this.match(TokenType.SIGNIFIER)
            ) {
                const equalToken = this.tokenFrom(
                    TokenType.EQUAL,
                    current,
                );

                pushAdvance(equalToken);
                continue;
            }

            if (
                previous
                && current.type === TokenType.LESS
                && previous.type === TokenType.SIGNIFIER
                && this.match(TokenType.SIGNIFIER)
            ) {
                const lessThanToken = this.tokenFrom(
                    TokenType.LESS_THAN,
                    current,
                );

                pushAdvance(lessThanToken);
                continue;
            }

            if (
                previous
                && current.type === TokenType.GREATER
                && previous.type === TokenType.SIGNIFIER
                && this.match(TokenType.SIGNIFIER)
            ) {
                const greaterThanToken = this.tokenFrom(
                    TokenType.GREATER_THAN,
                    current,
                );

                pushAdvance(greaterThanToken);
                continue;
            }

            if (
                previous
                && current.type === TokenType.LESS
                && previous.type === TokenType.SIGNIFIER
                && this.match(TokenType.COLON)
            ) {
                const lessEqualThanToken = this.tokenFrom(
                    TokenType.LESS_EQUAL_THAN,
                    current,
                );

                pushAdvance(lessEqualThanToken);
                this.advance();
                continue;
            }

            if (
                previous
                && current.type === TokenType.GREATER
                && previous.type === TokenType.SIGNIFIER
                && this.match(TokenType.COLON)
            ) {
                const greaterEqualThanToken = this.tokenFrom(
                    TokenType.GREATER_EQUAL_THAN,
                    current,
                );

                pushAdvance(greaterEqualThanToken);
                this.advance();
                continue;
            }



            if (
                current.type === TokenType.SIGNIFIER
                && (this.match(TokenType.DOT) || this.match(TokenType.EOF))
            ) {
                const collectionToken = this.tokenFrom(
                    TokenType.COLLECTION,
                    current,
                );

                pushAdvance(collectionToken);
                continue;
            }


            if (
                previous
                && current.type === TokenType.PIPE
                && previous.type === TokenType.SIGNIFIER
                && this.match(TokenType.SIGNIFIER)
            ) {
                const orToken = this.tokenFrom(
                    TokenType.OR,
                    current,
                );

                pushAdvance(orToken);
                continue;
            }

            if (
                previous
                && current.type === TokenType.AMPERSAND
                && previous.type === TokenType.SIGNIFIER
                && this.match(TokenType.SIGNIFIER)
            ) {
                const andToken = this.tokenFrom(
                    TokenType.AND,
                    current,
                );

                pushAdvance(andToken);
                continue;
            }

            if (
                current.type === TokenType.BANG
                && this.match(TokenType.COLON)
            ) {
                const notEqualToken = this.tokenFrom(
                    TokenType.NOT_EQUAL,
                    current,
                );

                pushAdvance(notEqualToken);
                this.advance();
                continue;
            }

            tokens.push(current);
            this.advance();
        }

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

    private previous() {
        return this.tokens[this.current - 1];
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

    private tokenFrom(
        type: TokenType,
        data: Token,
    ) {
        const token = new Token(
            type,
            data.lexeme,
            data.literal,
            data.line,
        );

        return token;
    }
}
// #endregion module



// #region exports
export default Identifier;
// #endregion exports
