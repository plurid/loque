// #region imports
    // #region external
    import {
        nonAlphanumericCharacters,
    } from '../../data/constants';

    import {
        TokenType,
    } from '../../data/enumerations';

    import Token from '../Token';
    // #endregion external
// #endregion imports



// #region module
class Scanner {
    private source: string;
    private tokens: Token[];
    private start: number = 0;
    private current: number = 0;
    private line: number = 1;
    private keywords: Record<string, TokenType>;
    private loqueError: any;

    constructor(
        source: string,
        error: any,
    ) {
        this.source = source;
        this.tokens = [];
        this.loqueError = error;

        this.keywords = {
            first: TokenType.FIRST,
            last: TokenType.LAST,
            above: TokenType.ABOVE,
            below: TokenType.BELOW,
            all: TokenType.ALL,
        };
    }

    public scanTokens() {
        while (!this.isAtEnd()) {
            this.start = this.current;
            this.scanToken();
        }

        this.endScan();

        this.identify();

        return this.tokens;
    }


    private scanToken() {
        const character = this.advance();

        switch (character) {
            case '.':
                this.addToken(TokenType.DOT);
                break;
            case ':':
                this.addToken(TokenType.COLON);
                break;
            case '<':
                this.addToken(TokenType.LESS_THAN);
                break;
            case '>':
                this.addToken(TokenType.GREATER_THAN);
                break;
            case '&':
                this.addToken(TokenType.AMPERSAND);
                break;
            case '|':
                this.addToken(TokenType.PIPE);
                break;
            case '!':
                this.addToken(TokenType.BANG);
                break;
            case '{':
                this.addToken(TokenType.LEFT_CURLY_BRACKET);
                break;
            case '}':
                this.addToken(TokenType.RIGHT_CURLY_BRACKET);
                break;
            case '/':
                this.slash();
                break;
            case '*':
                this.star();
                break;

            case ' ':
            case '\r':
            case '\t':
                // Ignore whitespace.
                break;

            case '\'':
                this.apostrophe();
                break;
            case '\n':
                this.line++;
                break;

            default:
                this.signifier();
                break;
        }
    }


    private addToken(
        type: TokenType,
    ) {
        this.addTokenLiteral(type, null);
    }

    private addTokenLiteral(
        type: TokenType,
        literal: any,
    ) {
        const text = this.source.substring(this.start, this.current);

        const newToken = new Token(
            type,
            text,
            literal,
            this.line,
        );

        this.tokens.push(newToken);
    }

    private dot() {
        this.signifier();
    }

    private slash() {
        if (this.match('/')) {
            // A comment goes until the end of the line.
            while (this.peek() !== '\n' && !this.isAtEnd()) {
                this.advance();
            }
        } else if (this.match('*')) {
            // A multline comment goes until starslash (*/).
            while (this.peek() !== '*' && !this.isAtEnd()) {
                this.advance();
            }
        } else {
            this.signifier();
        }
    }

    private star() {
        if (this.match('/')) {
            // End of multiline comment.
            this.advance();
        }
    }

    private apostrophe() {

    }

    private signifier() {
        while (
            this.isAlphaNumeric(this.peek())
            && !this.isAtEnd()
        ) {
            this.advance();
        }

        // See if the signifier is a reserved word.
        const text = this.source.substring(this.start, this.current);

        let type = this.keywords[text];

        if (!type) {
            type = TokenType.SIGNIFIER;
        }

        switch (type) {
            case TokenType.FIRST:
            case TokenType.LAST:
            case TokenType.ABOVE:
            case TokenType.BELOW:
            case TokenType.ALL: {
                // check if in cursors

                break;
            }
        }

        this.addToken(type);
    }

    private endScan() {
        const endOfFile = new Token(
            TokenType.EOF,
            '',
            null,
            this.line,
        );

        this.tokens.push(endOfFile);
    }

    private identify() {
        // const identifier = new Identifier(this.tokens);
        // const tokens = identifier.identify();

        // this.tokens = [
        //     // ...tokens,
        // ];
    }



    // Utilities
    private advance() {
        this.current += 1;
        return this.source.charAt(this.current - 1);
    }

    private advanceEscaped() {
        this.current += 2;
        return this.source.charAt(this.current - 1);
    }

    private match(
        expected: string,
    ) {
        if (this.isAtEnd()) {
            return false;
        }

        if (this.source.charAt(this.current) !== expected) {
            return false;
        }

        this.current += 1;
        return true;
    }

    private peek() {
        if (this.isAtEnd()) {
            return '\0';
        }

        return this.source.charAt(this.current);
    }

    private isAlpha(
        c: string,
    ) {
        return (c >= 'a' && c <= 'z')
            || (c >= 'A' && c <= 'Z')
            || c === '_'
            || c === '-'
            || c === '.'
            || c === '/'
            || c === '['
            || c === ']'
            || c === '$'
            || c === ':';
    }

    private isDigit(
        character: string,
    ) {
        return character >= '0' && character <= '9';
    }

    private isAlphaNumeric(
        c: string,
    ) {
        return !nonAlphanumericCharacters.includes(c);
    }

    private isAtEnd() {
        return this.current >= this.source.length;
    }

    private inGroup(
        position: number,
    ) {
        const tokens = this.tokens
            .slice(0, position)
            .reverse();

        return '';
        // return inGroupClassify(
        //     tokens,
        // );
    }
}
// #endregion module



// #region exports
export default Scanner;
// #endregion exports
