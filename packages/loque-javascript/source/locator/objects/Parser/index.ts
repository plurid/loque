// #region imports
    // #region external
    import Token from '../Token';
    import * as Statement from '../Statement';

    import {
        TokenType,
    } from '../../data/enumerations';

    import {
        LocatorDocument,
        LocatorKey,
        LocatorKeyComparison,
        LocatorCursor,
    } from '../../data/interfaces';
    // #endregion external
// #endregion imports



// #region module
class Parser {
    private tokens: Token[];
    private current = 0;
    private ParseError = class ParseError extends Error {};
    private loqueError: any;


    constructor(
        tokens: Token[],
        error: any,
    ) {
        this.tokens = tokens;
        this.loqueError = error;
    }


    public parse() {
        const statements: Statement.Statement[] = [];

        while (!this.isAtEnd()) {
            const declaration = this.declaration();
            if (declaration) {
                statements.push(declaration);
            }
        }

        return statements;
    }

    private declaration() {
        try {
            const current = this.peek();

            if (
                current.type === TokenType.COLLECTION
            ) {
                return this.collection();
            }

            if (
                current.type === TokenType.DOT
            ) {
                return this.dot();
            }

            this.advance();
            return;
        } catch (error) {
            this.synchronize();
            return null;
        }
    }

    private handleIdentifier() {
        // const name = this.peek();
        // this.advance();
        // const value = this.peek();

        // const nestLevel = this.nestLevel(this.current - 1);
        // const nested = nestLevel === 'NESTED_LIST'
        //     || nestLevel === 'NESTED_MAP';

        // const rootKind = nestLevel === 'NESTED_LIST'
        //     ? 'list'
        //     : 'map';

        // switch (value.type) {
        //     case TokenType.STRING: {
        //         const expression = new Expression.LiteralExpression(value.literal);
        //         this.advance();
        //         if (nested) {
        //             return new Statement.KeyStatement(name, expression);
        //         } else {
        //             return new Statement.LeaflinkStatement(name, expression);
        //         }
        //     }
        //     case TokenType.LINK: {
        //         if (nested) {
        //             const expression = new Expression.LiteralExpression(value.literal);
        //             this.advance();
        //             return new Statement.LinkStatement(
        //                 name,
        //                 expression,
        //                 rootKind,
        //             );
        //         } else {
        //             const expression = new Expression.LinkExpression(value.literal);
        //             this.advance();
        //             return new Statement.LeaflinkStatement(
        //                 name,
        //                 expression,
        //             );
        //         }
        //     }
        //     case TokenType.LEFT_CURLY_BRACKET: {
        //         const expression = this.handleMap();
        //         if (expression instanceof Expression.MapExpression) {
        //             if (nested) {
        //                 return new Statement.KeyStatement(name, expression);
        //             } else {
        //                 return new Statement.LeaflinkStatement(name, expression);
        //             }
        //         }
        //         break;
        //     }
        //     case TokenType.LEFT_SQUARE_BRACKET: {
        //         const expression = this.handleList();
        //         if (expression instanceof Expression.ListExpression) {
        //             if (nested) {
        //                 return new Statement.KeyStatement(name, expression);
        //             } else {
        //                 return new Statement.LeaflinkStatement(name, expression);
        //             }
        //         }
        //     }
        // }

        // if (nested) {
        //     return new Statement.KeyStatement(name, null);
        // } else {
        //     return new Statement.LeaflinkStatement(name, null);
        // }
    }

    private handleMap() {
        // const nestLevel = this.nestLevel(this.current);
        // // console.log('nestLevel', nestLevel);

        // const previous = this.tokens[this.current - 1];
        // // console.log('previous', previous);

        // const isLeaflink = nestLevel === 'ROOT' && (
        //     previous && previous.type === TokenType.IDENTIFIER
        // );

        // const nested = nestLevel === 'NESTED_LIST'
        //     || nestLevel === 'NESTED_MAP';

        // if (nested) {
        //     return new Expression.MapExpression(
        //         this.block(
        //             TokenType.LEFT_CURLY_BRACKET,
        //         ),
        //     );
        // }

        // if (isLeaflink) {
        //     return new Expression.MapExpression(
        //         this.block(
        //             TokenType.LEFT_CURLY_BRACKET,
        //         ),
        //     );
        // }

        // return new Statement.RootStatement(
        //     'map',
        //     this.block(
        //         TokenType.LEFT_CURLY_BRACKET,
        //     ),
        // )
    }

    private collection() {
        const token = this.peek();

        const collection = new Statement.CollectionStatement(
            token.lexeme,
        );

        this.advance();

        return collection;
    }

    private dot() {
        const next = this.next();

        if (next && next.type === TokenType.DOT) {
            return this.collection();
        }

        return this.document();
    }

    private document() {
        this.consume(TokenType.DOT, 'Expected document to belong to a collection.');

        const documentTokens: Token[] = [];

        while (
            !this.isAtEnd()
            && !this.check(TokenType.DOT)
        ) {
            const current = this.peek();
            documentTokens.push(current);

            this.advance();
        }

        const keys: LocatorKey[] = [];
        let cursor: LocatorCursor | null = null;
        let index = 0;

        while (
            index < documentTokens.length
        ) {
            const token = documentTokens[0];

            if (token.type === TokenType.KEY) {
                const key = token.lexeme;

                const comparison = documentTokens[1].lexeme as LocatorKeyComparison;
                const value = documentTokens[2].lexeme;

                const locatorKey: LocatorKey = {
                    key,
                    value,
                    comparison,
                };
                keys.push(locatorKey);

                index += 2;
            }

            index += 1;
        }

        console.log('documentTokens', documentTokens);
        console.log('keys', keys);

        this.advance();

        const document = new Statement.DocumentStatement(
            keys,
        );
        return document;
    }


    private block(
        tokenType: TokenType,
    ) {
        // this.advance();

        // switch (tokenType) {
        //     case TokenType.LEFT_CURLY_BRACKET: {
        //         const statements: any[] = [];

        //         while (
        //             !this.check(TokenType.RIGHT_CURLY_BRACKET)
        //             && !this.isAtEnd()
        //         ) {
        //             const declaration = this.declaration();
        //             if (declaration) {
        //                 statements.push(declaration);
        //             }
        //         }

        //         this.consume(
        //             TokenType.RIGHT_CURLY_BRACKET,
        //             "Expect '}' after block.",
        //         );

        //         return statements;
        //     }
        //     case TokenType.LEFT_SQUARE_BRACKET: {
        //         const statements: any[] = [];

        //         while (
        //             !this.check(TokenType.RIGHT_SQUARE_BRACKET)
        //             && !this.isAtEnd()
        //         ) {
        //             const declaration = this.declaration();
        //             if (declaration) {
        //                 statements.push(declaration);
        //             }
        //         }

        //         this.consume(
        //             TokenType.RIGHT_SQUARE_BRACKET,
        //             "Expect ']' after block.",
        //         );

        //         return statements;
        //     }
        //     default:
        //         return [];
        // }
    }

    private consume(
        type: TokenType,
        message: string,
    ) {
        if (this.check(type)) {
            return this.advance();
        }

        throw this.error(this.peek(), message);
    }

    private error(
        token: Token,
        message: string,
    ) {
        this.loqueError(token, message);

        return new this.ParseError();
    }

    private synchronize() {
        this.advance();

        while(
            !this.isAtEnd()
        ) {
            // if (this.previous().type === TokenType.SEMICOLON) {
            //     return;
            // }

            // switch (this.peek().type) {
            //     case TokenType.CLASS:
            //     case TokenType.FUN:
            //     case TokenType.VAR:
            //     case TokenType.FOR:
            //     case TokenType.IF:
            //     case TokenType.WHILE:
            //     case TokenType.PRINT:
            //     case TokenType.RETURN:
            //         return;
            // }

            this.advance();
        }
    }

    private check(
        type: TokenType,
    ) {
        if (this.isAtEnd()) {
            return false;
        }

        return this.peek().type === type;
    }

    private advance() {
        // console.log('CURRENT TOKEN', this.tokens[this.current]);

        if (!this.isAtEnd()) {
            this.current += 1;
        }

        return this.previous();
    }

    private isAtEnd() {
        return this.peek().type === TokenType.EOF;
    }

    private peek() {
        return this.tokens[this.current];
    }

    private previous() {
        return this.tokens[this.current - 1];
    }

    private next() {
        return this.tokens[this.current + 1];
    }

    private nestLevel(
        position: number,
    ) {
        const tokens = this.tokens
            .slice(0, position)
            .reverse();

        if (tokens.length === 0) {
            return 'ROOT';
        }

        const curlyBrackets = {
            left: 0,
            right: 0,
        };

        for (const token of tokens) {
            switch (token.type) {
                case TokenType.LEFT_CURLY_BRACKET:
                    curlyBrackets.left += 1;
                    break;
                case TokenType.RIGHT_CURLY_BRACKET:
                    curlyBrackets.right += 1;
                    break;
            }

            if (curlyBrackets.left > curlyBrackets.right) {
                return 'NESTED_MAP';
            }
        }

        /**
         * TODO
         * to find a less expensive way to check for leaflinks
         */
        if (
            curlyBrackets.left === curlyBrackets.right
        ) {
            return 'ROOT';
        }

        return;
    }

    private listIndex() {
        const tokens = this.tokens
            .slice(0, this.current)
            .reverse();

        if (tokens.length === 0) {
            return '0';
        }

        const curlyBrackets = {
            left: 0,
            right: 0,
        };
        const squareBrackets = {
            left: 0,
            right: 0,
        };

        const atListRoot = () => {
            if (
                curlyBrackets.left === curlyBrackets.right
                && squareBrackets.left === squareBrackets.right
            ) {
                return true;
            }

            return false;
        }

        let listIndex = -1;

        // console.log('listIndex tokens', tokens);
        // console.log('listIndex', listIndex);

        for (const token of tokens) {
            // console.log('token', token);
            // console.log('atListRoot()', atListRoot());

            switch (token.type) {
                case TokenType.LEFT_CURLY_BRACKET:
                    curlyBrackets.left += 1;
                    break;
                case TokenType.RIGHT_CURLY_BRACKET:
                    curlyBrackets.right += 1;
                    break;
            }

            if (atListRoot()) {
                listIndex += 1;
            }
        }

        // console.log('listIndex', listIndex);

        return listIndex + '';
    }
}
// #endregion module



// #region exports
export default Parser;
// #endregion exports
